import json
import logging
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import boto3

# Log level can be overridden at runtime via the Lambda environment variable
# LOG_LEVEL (e.g. set to "DEBUG" in the AWS Console) without redeploying.
# Logs are available in CloudWatch under the SensiqHistoryStack-HandleHistoryData log group.
logger = logging.getLogger(__name__)
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

athena_client = boto3.client("athena")

# Athena GetQueryResults caps a single page at 1000 rows.
# See: https://docs.aws.amazon.com/athena/latest/APIReference/API_GetQueryResults.html
MAX_RESULT_LIMIT = 1000
DEFAULT_RESULT_LIMIT = 100

# When no date range is supplied, restrict scanning to the most recent N days so partition
# pruning still applies. Without this anchor, Athena enumerates every projected
# partition, which turns trivial queries into multi-minute scans (observed in integration tests).
DEFAULT_LOOKBACK_DAYS = 31

# Defines the time bucketing intervals for data aggregation.
PRECISIONS = {
    "all": None,
    "1_minute": "date_trunc('minute', timestamp)",
    "10_minutes": "from_unixtime(floor(to_unixtime(timestamp) / 600.0) * 600.0)",
    "1_hour": "date_trunc('hour', timestamp)",
    "1_day": "date_trunc('day', timestamp)",
    "1_week": "date_trunc('week', timestamp)",
    "1_month": "date_trunc('month', timestamp)",
    "1_year": "date_trunc('year', timestamp)",
}

# The SELECT clause used for aggregated queries. Applies averages to numerics,
# majority voting to booleans, and keeps the latest value for strings/timestamps.
AGGREGATIONS = """
    max(timestamp) AS timestamp,
    max_by(device_id, timestamp) AS device_id,
    max_by(location, timestamp) AS location,
    avg(running_time) AS running_time,
    avg(dht_humidity) AS dht_humidity,
    avg(dht_temperature) AS dht_temperature,
    avg(dht_heat_index) AS dht_heat_index,
    avg(flame_analog) AS flame_analog,
    avg(case when flame_digital then 1.0 else 0.0 end) >= 0.5 AS flame_digital,
    avg(thermistor_analog) AS thermistor_analog,
    avg(case when thermistor_digital then 1.0 else 0.0 end) >= 0.5 AS thermistor_digital,
    avg(thermistor_temp) AS thermistor_temp,
    avg(case when bme_heated_up then 1.0 else 0.0 end) >= 0.5 AS bme_heated_up,
    avg(bme_temperature) AS bme_temperature,
    avg(bme_humidity) AS bme_humidity,
    avg(bme_pressure) AS bme_pressure,
    avg(bme_altitude) AS bme_altitude,
    avg(bme_voc) AS bme_voc,
    avg(tsl_lux) AS tsl_lux,
    avg(case when is_outlier then 1.0 else 0.0 end) >= 0.5 AS is_outlier,
    avg(case when collect_training then 1.0 else 0.0 end) >= 0.5 AS collect_training
"""

# Terminal states reported by Athena's GetQueryExecution.
_TERMINAL_FAILURE_STATES = ("FAILED", "CANCELLED")
_TERMINAL_RUNNING_STATES = ("RUNNING", "QUEUED")


class AthenaQueryError(RuntimeError):
	"""Raised when an Athena query fails, is cancelled, or times out."""


def _parse_iso(date_str: str) -> Optional[datetime]:
	"""Parse an ISO 8601 timestamp string into a UTC datetime.

	Accepts the trailing 'Z' shorthand for UTC, explicit offsets such as '+02:00',
	and naive timestamps (which are assumed to be UTC). Any value that cannot be
	parsed yields ``None`` rather than raising, so callers can fall back gracefully.

	Args:
		date_str (str): The ISO 8601 date string to parse, e.g. ``"2026-01-01T00:00:00Z"``
			or ``"2026-01-01T00:00:00+02:00"``.

	Returns:
		Optional[datetime]: A timezone-aware ``datetime`` in UTC on success,
		or ``None`` if the input is not a valid ISO 8601 timestamp.

	Examples:
		>>> _parse_iso("2026-01-01T00:00:00Z")
		datetime.datetime(2026, 1, 1, 0, 0, tzinfo=datetime.timezone.utc)
		>>> _parse_iso("2026-01-01T00:00:00+02:00")
		datetime.datetime(2025, 12, 31, 22, 0, tzinfo=datetime.timezone.utc)
	"""
	try:
		# datetime.fromisoformat does not accept 'Z' until Python 3.11; normalise.
		normalised = date_str.replace("Z", "+00:00")
		dt = datetime.fromisoformat(normalised)
		if dt.tzinfo is None:
			dt = dt.replace(tzinfo=timezone.utc)
		return dt.astimezone(timezone.utc)
	except (ValueError, TypeError):
		return None


def _athena_timestamp_to_iso(value: Optional[str]) -> Optional[str]:
    """Convert Athena's 'YYYY-MM-DD HH:MM:SS[.fff]' string to ISO 8601 UTC ('...Z')."""
    if value is None:
        return None
    try:
        dt = datetime.fromisoformat(value)  # space separator + optional .fff OK on 3.11+
    except ValueError:
        return value  # unexpected format: leave as-is rather than corrupt it
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)  # stored data is UTC
    return dt.isoformat().replace("+00:00", "Z")

def _partition_predicate(start: datetime, end: datetime) -> str:
	"""Build a SQL ``WHERE`` fragment that lets Athena prune Glue partitions.

	The Glue table is partitioned by three string columns ``year`` / ``month`` / ``day``,
	written by Firehose with fixed-width zero padding (e.g. ``year='2026'``,
	``month='01'``, ``day='05'``). Comparison is safe without casting.

	Without such a predicate, Athena would enumerate every partition produced by the
	table's partition projection settings, which (depending on the configured year
	range) can be millions of virtual partitions and turn a trivial ``LIMIT 10`` into
	a multi-minute query., as seen in integration tests before.

	Strategy:
		* For windows spanning at most 366 days, emit an ``IN`` list of explicit
		  ``(year, month, day)`` tuples. This is the tightest possible pruning and
		  removes every non-matching partition before any S3 object is opened.
		* For wider windows the IN list would grow unwieldy, so fall back to a
		  coarser ``year BETWEEN ...`` predicate that still excludes whole years
		  outside the range.

	Args:
		start (datetime): Inclusive start of the query window. Must be timezone-aware
			and normalised to UTC (see :func:`_parse_iso`). Caller is responsible for
			ensuring ``start <= end``.
		end (datetime): Inclusive end of the query window, in UTC.

	Returns:
		str: A SQL predicate fragment (without leading ``WHERE``/``AND``) suitable
		for concatenation into the main query.

	Examples:
		Short range (3 days) → explicit tuple IN-list::

			>>> _partition_predicate(
			...     datetime(2026, 1, 1, tzinfo=timezone.utc),
			...     datetime(2026, 1, 3, 12, 0, tzinfo=timezone.utc),
			... )
			"(year, month, day) IN (('2026','01','01'), ('2026','01','02'), ('2026','01','03'))"

		Same day → single tuple::

			>>> _partition_predicate(
			...     datetime(2026, 5, 25, 8, tzinfo=timezone.utc),
			...     datetime(2026, 5, 25, 20, tzinfo=timezone.utc),
			... )
			"(year, month, day) IN (('2026','05','25'))"

		Wide range (> 366 days) → year fallback::

			>>> _partition_predicate(
			...     datetime(2024, 1, 1, tzinfo=timezone.utc),
			...     datetime(2026, 12, 31, tzinfo=timezone.utc),
			... )
			"year BETWEEN '2024' AND '2026'"
	"""
	start_day = start.replace(hour=0, minute=0, second=0, microsecond=0)
	end_day = end.replace(hour=0, minute=0, second=0, microsecond=0)
	days = (end_day - start_day).days

	# 366 keeps the IN-list bounded (worst case ~366 tuples for a leap year) while
	# still covering the most common API use cases. Beyond that the predicate
	# itself starts to dominate query planning time, so coarsen to year-level.
	if 0 <= days <= 366:
		tuples: List[str] = []
		current = start_day
		while current <= end_day:
			tuples.append(f"('{current:%Y}','{current:%m}','{current:%d}')")
			current += timedelta(days=1)
		return "(year, month, day) IN (" + ", ".join(tuples) + ")"

	# Year-level pruning is a deliberate accuracy/cost trade-off: Maybe scanning a
	# few extra months at the window edges, but therefore avoid building a giant IN-list
	# for rarely-used multi-year requests.
	return f"year BETWEEN '{start.year:04d}' AND '{end.year:04d}'"


def build_query(query_params: Dict[str, Any]) -> Tuple[str, List[str]]:
	"""Build the parameterised Athena SQL query for a history request.

	Combines a partition-pruning predicate (always present) with optional
	timestamp-range predicates supplied via API Gateway JSON body parameters.
	The ``limit`` parameter is clamped to ``[1, MAX_RESULT_LIMIT]`` and falls back
	to :data:`DEFAULT_RESULT_LIMIT` on invalid input. When neither ``start_date``
	nor ``end_date`` is supplied, a :data:`DEFAULT_LOOKBACK_DAYS`-day window ending
	"now" is used purely to drive partition pruning — no timestamp predicate is
	emitted in that case. Requires a ``device_id`` parameter.

	Args:
		query_params (Dict[str, Any]): Raw JSON body parameters. Recognised keys:

			* ``device_id`` (str): Required device ID to filter by.
			* ``limit`` (int or str, optional): Maximum rows to return.
			* ``start_date`` (str, optional): Inclusive lower bound, ISO 8601.
			* ``end_date`` (str, optional): Inclusive upper bound, ISO 8601.
			* ``precision`` (str, optional): The interval for aggregation (e.g. ``10_minutes``).

	Returns:
		Tuple[str, List[str]]: The SQL query string and a list of execution
			parameters to pass as ``ExecutionParameters`` (used in place of string
			interpolation to prevent SQL injection).
	"""
	device_id: Optional[str] = query_params.get("device_id")
	start_date: Optional[str] = query_params.get("start_date")
	end_date: Optional[str] = query_params.get("end_date")
	precision: str = query_params.get("precision", "10_minutes")

	if precision not in PRECISIONS:
		precision = "10_minutes"

	# Defensive parsing: API Gateway forwards query strings as raw strings, and a
	# non-integer ``limit`` would otherwise raise inside the Lambda and surface as
	# a generic 500. Fall back to the default instead so the request still succeeds.
	try:
		limit_int = int(query_params.get("limit", DEFAULT_RESULT_LIMIT))
	except (TypeError, ValueError):
		limit_int = DEFAULT_RESULT_LIMIT
  
	# Non-positive values are treated as "client sent nonsense" and reset to the
	# default rather than clamped to 1, which would silently return a single row.
	if limit_int < 1:
		limit_int = DEFAULT_RESULT_LIMIT
  
	# Cap at the Athena single-page maximum to avoid silently truncated pages
	# that would require pagination handling we do not implement.
	limit_int = min(limit_int, MAX_RESULT_LIMIT)

	# Resolve a concrete UTC window so that partition pruning always applies,
	# even when the caller omits one or both bounds.
	end_dt = _parse_iso(end_date) if end_date else datetime.now(tz=timezone.utc)
	start_dt = (
		_parse_iso(start_date) if start_date else end_dt - timedelta(days=DEFAULT_LOOKBACK_DAYS)
	)
 
	# Tolerate reversed bounds rather than rejecting the request: clients
	# occasionally swap the two when wiring up the UI date pickers.
	if start_dt > end_dt:
		start_dt, end_dt = end_dt, start_dt

	conditions: List[str] = [_partition_predicate(start_dt, end_dt)]
	execution_parameters: List[str] = []

	if device_id:
		conditions.append("device_id = ?")
		execution_parameters.append(device_id)

	# ExecutionParameters are used in place of string interpolation to prevent SQL injection.
	# from_iso8601_timestamp accepts ISO 8601 strings with 'T' separator and 'Z'/offset,
	# unlike CAST(... AS timestamp) which requires 'YYYY-MM-DD HH:MM:SS[.fff]' without a
	# timezone designator.
	if start_date:
		conditions.append("timestamp >= from_iso8601_timestamp(?)")
		execution_parameters.append(start_date)
	if end_date:
		conditions.append("timestamp <= from_iso8601_timestamp(?)")
		execution_parameters.append(end_date)

	where_clause = " AND ".join(conditions)
	precision_expr = PRECISIONS.get(precision)

	if precision_expr is None:
		# precision 'all'
		query = f"SELECT * FROM sensor_data WHERE {where_clause} ORDER BY timestamp DESC LIMIT {limit_int}"
	else:
		query = (
			f"SELECT {AGGREGATIONS} "
			f"FROM sensor_data "
			f"WHERE {where_clause} "
			f"GROUP BY {precision_expr} "
			f"ORDER BY timestamp DESC "
			f"LIMIT {limit_int}"
		)

	logger.debug("Built Athena query: %s | params=%s", query, execution_parameters)
	return query, execution_parameters


def poll_query_status(query_execution_id: str, timeout_seconds: int = 25) -> None:
	"""Block until an Athena query reaches a terminal state.

	Athena query executions transition through ``QUEUED`` → ``RUNNING`` → one of
	``SUCCEEDED`` / ``FAILED`` / ``CANCELLED``. This helper polls
	``get_query_execution`` every 500 ms until a terminal state is observed, the
	``timeout_seconds`` budget is exceeded, or the query ends in failure.

	The default timeout is 25 seconds because API Gateway caps Lambda integrations
	at 29 seconds; the remaining ~4 s budget covers result fetching and response
	serialisation.

	See: `Athena Query Execution States
	<https://docs.aws.amazon.com/athena/latest/ug/querying.html#query-execution-states>`_.

	Args:
		query_execution_id (str): The execution ID returned by
			``start_query_execution``.
		timeout_seconds (int, optional): Maximum seconds to wait for completion.
			Defaults to ``25``.

	Raises:
		AthenaQueryError: If the query ends in ``FAILED`` or ``CANCELLED`` state,
			or if the timeout elapses before reaching a terminal state.
	"""
	start_time = time.time()
	status = "RUNNING"

	logger.debug(
		"Polling Athena query %s for completion (timeout=%ss)",
		query_execution_id, timeout_seconds,
	)

	while status in _TERMINAL_RUNNING_STATES:
		elapsed = time.time() - start_time
		if elapsed > timeout_seconds:
			logger.error("Athena query %s timed out after %ss", query_execution_id, timeout_seconds)
			raise AthenaQueryError(f"Query timed out after {timeout_seconds} seconds")

		# 250 ms balances responsiveness for fast cached queries against the
		# per-request cost of GetQueryExecution; tighter polling burns API
		# quota without meaningfully improving user-perceived latency.
		time.sleep(0.25)
		status_response = athena_client.get_query_execution(QueryExecutionId=query_execution_id)
		status = status_response["QueryExecution"]["Status"]["State"]
		logger.debug("Query %s status=%s after %.2fs", query_execution_id, status, elapsed)

		if status in _TERMINAL_FAILURE_STATES:
			reason = status_response["QueryExecution"]["Status"].get(
				"StateChangeReason", "Unknown reason"
			)
			logger.error("Athena query %s ended in state %s: %s", query_execution_id, status, reason)
			raise AthenaQueryError(f"Query failed or cancelled: {reason}")

	logger.info(
		"Athena query %s succeeded in %.2fs",
		query_execution_id, time.time() - start_time,
	)


def fetch_and_format_results(query_execution_id: str) -> List[Dict[str, Any]]:
	"""Fetch Athena query results and convert them into row dictionaries.

	The caller must ensure the query has already reached ``SUCCEEDED`` state
	(typically by awaiting :func:`poll_query_status`). The state is intentionally
	**not** re-validated here to avoid a redundant ``GetQueryExecution`` call and
	its associated latency.

	The first row returned by Athena is the header row and is skipped; remaining
	rows are mapped column-by-column using the result set's ``ColumnInfo`` metadata.
	All values are returned as their raw ``VarCharValue`` strings.
 
	See: <a href="https://docs.aws.amazon.com/athena/latest/APIReference/API_GetQueryResults.html#API_GetQueryResults_ResponseSyntax">
	Athena GetQueryResults response syntax</a> 

	Args:
		query_execution_id (str): The execution ID of a successfully completed
			Athena query.

	Returns:
		List[Dict[str, Any]]: One dictionary per data row, keyed by column name.
	"""
	results_response = athena_client.get_query_results(
		QueryExecutionId=query_execution_id, MaxResults=MAX_RESULT_LIMIT
	)

	# Column order in each Row matches ColumnInfo, so materialise the names
	# once and zip them in via index rather than re-reading metadata per row.
	column_info = results_response["ResultSet"]["ResultSetMetadata"]["ColumnInfo"]
	columns: List[str] = [col["Name"] for col in column_info]
	column_types: List[str] = [col["Type"] for col in column_info]

	# Athena prepends a header row containing the column names; only the
	# subsequent rows carry actual data.
	rows: List[Dict[str, Any]] = []
	for row in results_response["ResultSet"]["Rows"][1:]:  # skip header row
		data = row["Data"]
		parsed_row: Dict[str, Any] = {}
		for idx, col in enumerate(columns):
			value = data[idx].get("VarCharValue")
			if column_types[idx] in ("timestamp", "timestamp with time zone"):  # <-- add
				value = _athena_timestamp_to_iso(value)
			parsed_row[col] = value
		rows.append(parsed_row)

	logger.info("Fetched %d rows for query %s", len(rows), query_execution_id)
	return rows


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
	"""Lambda entry point: query historical IoT sensor data via Athena.

	Wired behind an API Gateway proxy integration on ``POST /history``. Builds a
	parameterised Athena query from the request's JSON ``body``,
	executes it against the workgroup/database supplied via environment variables,
	waits for completion, and returns the result rows as JSON.

	Args:
		event (Dict[str, Any]): API Gateway proxy event. Recognised
			keys in the JSON ``body``:

			* ``limit`` (str, optional): Maximum number of records to return
			  (default ``100``, capped at :data:`MAX_RESULT_LIMIT`).
			* ``start_date`` (str, optional): Inclusive start timestamp in ISO 8601
			  format, e.g. ``"2026-05-25T00:00:00Z"``.
			* ``end_date`` (str, optional): Inclusive end timestamp in ISO 8601 format.
		context (Any): AWS Lambda context object (unused).

	Returns:
		Dict[str, Any]: API Gateway proxy response.

			* ``200``: ``body`` is JSON ``{"data": [...rows]}`` on success.
			* ``400``: ``body`` is JSON ``{"error": "Invalid JSON body"}`` if the request body is not valid JSON.
			* ``500``: ``body`` is JSON ``{"error": "..."}`` on any failure
			  (query failed, cancelled, timed out, or an unexpected exception).
	"""
	# Workgroup and database are injected by the CDK stack as environment variables.
	athena_workgroup = os.environ.get("ATHENA_WORKGROUP", "")
	database_name = os.environ.get("DATABASE_NAME", "")

	body_str = event.get("body")
	query_params: Dict[str, Any] = {}
	if body_str:
		try:
			query_params = json.loads(body_str)
		except json.JSONDecodeError:
			return {
				"statusCode": 400,
				"headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
				"body": json.dumps({"error": "Invalid JSON body"}),
			}

	device_id = query_params.get("device_id")
	if not device_id:
		return {
			"statusCode": 400,
			"headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
			"body": json.dumps({"error": "Missing required parameter: device_id"}),
		}

	logger.info("Received request: query_params=%s", query_params)

	try:
		query, execution_parameters = build_query(query_params)

		start_query_args: Dict[str, Any] = {
			"QueryString": query,
			"QueryExecutionContext": {"Database": database_name},
			"WorkGroup": athena_workgroup,
		}
		# ExecutionParameters must be omitted (not passed as an empty list) when
		# the query contains no placeholders; Athena rejects the call otherwise.
		if execution_parameters:
			start_query_args["ExecutionParameters"] = execution_parameters

		query_execution_id = athena_client.start_query_execution(**start_query_args)[
			"QueryExecutionId"
		]
		logger.info("Started Athena query %s", query_execution_id)

		poll_query_status(query_execution_id)
		rows = fetch_and_format_results(query_execution_id)

		return {
			"statusCode": 200,
			"headers": {
				"Content-Type": "application/json",
				# Wildcard CORS is acceptable here because the endpoint only
				# returns historical sensor readings and requires no credentials.
				"Access-Control-Allow-Origin": "*",
			},
			"body": json.dumps({"data": rows}),
		}

	except Exception as e:
		# Catch-all so the API never returns an unhandled Lambda error to the
		# frontend; the full stack trace is preserved in CloudWatch via
		# logger.exception, while the client receives a sanitised message.
		logger.exception("Unhandled error while processing request")
		return {
			"statusCode": 500,
			"headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
			"body": json.dumps({"error": str(e)}),
		}
