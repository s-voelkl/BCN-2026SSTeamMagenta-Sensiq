import os
import json
import time
import logging
from datetime import datetime, timedelta, timezone
import boto3
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)
# Can be set to DEBUG via Console to mitigate re-deployments for debugging purposes.
# ENV: Lambda > Specific Lambda Function > Environment Variables > LOG_LEVEL = DEBUG / INFO
# Logs: CloudWatch > Log management > SensiqHistoryStack-HandleHistoryData...
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO")) 

athena_client = boto3.client("athena")

# Maximum number of results to return from Athena. 
# See: https://docs.aws.amazon.com/athena/latest/APIReference/API_GetQueryResults.html
MAX_RESULT_LIMIT = 1000
DEFAULT_RESULT_LIMIT = 100
# When no date range is supplied, restrict scanning to the most recent N days so partition
# pruning still applies and queries stay fast. 
# Else Athena would scan every partition (root cause of multi-minute query times).
DEFAULT_LOOKBACK_DAYS = 31


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

	if 0 <= days <= 366:
		tuples: List[str] = []
		current = start_day
		while current <= end_day:
			tuples.append(f"('{current:%Y}','{current:%m}','{current:%d}')")
			current += timedelta(days=1)
		return "(year, month, day) IN (" + ", ".join(tuples) + ")"

	# Fallback for wide ranges: prune at least by year.
	return f"year BETWEEN '{start.year:04d}' AND '{end.year:04d}'"


def build_query(query_params: Dict[str, str]) -> Tuple[str, List[str]]:
	"""Build the parameterised Athena SQL query for a history request.

	Combines a partition-pruning predicate (always present) with optional
	timestamp-range predicates supplied via API Gateway query string parameters.
	The ``limit`` parameter is clamped to ``[1, MAX_RESULT_LIMIT]`` and falls back
	to :data:`DEFAULT_RESULT_LIMIT` on invalid input. When neither ``startDate``
	nor ``endDate`` is supplied, a :data:`DEFAULT_LOOKBACK_DAYS`-day window ending
	"now" is used purely to drive partition pruning — no timestamp predicate is
	emitted in that case.

	Args:
		query_params (Dict[str, str]): Raw query string parameters. Recognised keys:

			* ``limit`` (str, optional): Maximum rows to return.
			* ``startDate`` (str, optional): Inclusive lower bound, ISO 8601.
			* ``endDate`` (str, optional): Inclusive upper bound, ISO 8601.

	Returns:
		Tuple[str, List[str]]: The SQL query string and a list of execution
			parameters to pass as ``ExecutionParameters`` (used in place of string
			interpolation to prevent SQL injection).
	"""
	limit: str = query_params.get("limit", str(DEFAULT_RESULT_LIMIT))
	start_date: Optional[str] = query_params.get("startDate")
	end_date: Optional[str] = query_params.get("endDate")

	# Validate and sanitize limit parameter
	try:
		limit_int: int = int(limit)
		if limit_int < 1:
			limit_int = DEFAULT_RESULT_LIMIT
		elif limit_int > MAX_RESULT_LIMIT:
			limit_int = MAX_RESULT_LIMIT
	except ValueError:
		limit_int = DEFAULT_RESULT_LIMIT

	# Resolve a concrete UTC window. If the caller omits one bound, anchor it so that
	# partition pruning can still be applied (otherwise Athena would enumerate every
	# projected partition, which is the root cause of multi-minute query times, 
 	# that could be seen in integration tests).
	end_dt = _parse_iso(end_date) if end_date else datetime.now(tz=timezone.utc)
	start_dt = _parse_iso(start_date) if start_date else end_dt - timedelta(days=DEFAULT_LOOKBACK_DAYS)
	if start_dt > end_dt:
		start_dt, end_dt = end_dt, start_dt

	query: str = "SELECT * FROM sensor_data WHERE "
	conditions: List[str] = [_partition_predicate(start_dt, end_dt)]
	execution_parameters: List[str] = []

	# Use ExecutionParameters for parameterized queries to prevent SQL Injection.
	# from_iso8601_timestamp accepts ISO 8601 strings with 'T' separator and 'Z'/offset
	# (e.g. 2026-01-01T00:00:00Z), unlike CAST(... AS timestamp) which requires
	# 'YYYY-MM-DD HH:MM:SS[.fff]' without timezone designator.
	if start_date:
		conditions.append("timestamp >= from_iso8601_timestamp(?)")
		execution_parameters.append(start_date)
	if end_date:
		conditions.append("timestamp <= from_iso8601_timestamp(?)")
		execution_parameters.append(end_date)

	query += " AND ".join(conditions)
	query += " ORDER BY timestamp DESC"
	query += f" LIMIT {limit_int}"
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
		Exception: If the query ends in ``FAILED`` or ``CANCELLED`` state, or if
			the timeout elapses before reaching a terminal state.
	"""
	status: str = "RUNNING"
	start_time = time.time()  # current time in seconds since epoch

	logger.debug("Polling Athena query %s for completion with timeout of %ss",
            	query_execution_id, timeout_seconds)

	while status in ["RUNNING", "QUEUED"]:
		logger.debug("Current status of query %s: %s, after %.2fs", 
               	query_execution_id, status, time.time() - start_time)
  
		if time.time() - start_time > timeout_seconds:
			logger.error("Athena query %s timed out after %ss", query_execution_id, timeout_seconds)
			raise Exception(f"Query timed out after {timeout_seconds} seconds")

		time.sleep(0.5)  # Sleep for 500ms before polling again
		status_response = athena_client.get_query_execution(
			QueryExecutionId=query_execution_id
		)
		status = status_response["QueryExecution"]["Status"]["State"]

		if status in ["FAILED", "CANCELLED"]:
			reason = status_response["QueryExecution"]["Status"].get(
				"StateChangeReason", "Unknown reason"
			)
			logger.error("Athena query %s ended in state %s: %s", query_execution_id, status, reason)
			raise Exception(f"Query failed or cancelled: {reason}")

	logger.info("Athena query %s succeeded in %.2fs", query_execution_id, time.time() - start_time)


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

	column_info = results_response["ResultSet"]["ResultSetMetadata"]["ColumnInfo"]
	columns: List[str] = [col["Name"] for col in column_info]

	rows: List[Dict[str, Any]] = []
	for row in results_response["ResultSet"]["Rows"][1:]:  # skip header row
		data = row["Data"]
		parsed_row: Dict[str, Any] = {}
		for idx, col in enumerate(columns):
			parsed_row[col] = data[idx].get("VarCharValue")
		rows.append(parsed_row)

	logger.info("Fetched %d rows for query %s", len(rows), query_execution_id)
	return rows


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
	"""Lambda entry point: query historical IoT sensor data via Athena.

	Wired behind an API Gateway proxy integration on ``GET /history``. Builds a
	parameterised Athena query from the request's ``queryStringParameters``,
	executes it against the workgroup/database supplied via environment variables,
	waits for completion, and returns the result rows as JSON.

	Args:
		event (Dict[str, Any]): API Gateway proxy event. Recognised
			``queryStringParameters`` keys:

			* ``limit`` (str, optional): Maximum number of records to return
			  (default ``100``, capped at :data:`MAX_RESULT_LIMIT`).
			* ``startDate`` (str, optional): Inclusive start timestamp in ISO 8601
			  format, e.g. ``"2026-05-25T00:00:00Z"``.
			* ``endDate`` (str, optional): Inclusive end timestamp in ISO 8601 format.
		context (Any): AWS Lambda context object (unused).

	Returns:
		Dict[str, Any]: API Gateway proxy response.

			* ``200``: ``body`` is JSON ``{"data": [...rows]}`` on success.
			* ``500``: ``body`` is JSON ``{"error": "..."}`` on any failure
			  (query failed, cancelled, timed out, or an unexpected exception).
	"""
	# Athena workgroup name, defined in the CDK stack as environment variable for the Lambda function
	athena_workgroup: str = os.environ.get("ATHENA_WORKGROUP", "")

	# Glue database name
	database_name: str = os.environ.get("DATABASE_NAME", "")

	query_params: Dict[str, str] = event.get("queryStringParameters") or {}
	logger.info("Received request: query_params=%s", query_params)

	try:
		# Build the SQL query and execution parameters (if any, used against SQL injection)
		query, execution_parameters = build_query(query_params)

		# Start the Athena Query
		start_query_args: Dict[str, Any] = {
			"QueryString": query,
			"QueryExecutionContext": {"Database": database_name},
			"WorkGroup": athena_workgroup,
		}
		if execution_parameters:
			start_query_args["ExecutionParameters"] = execution_parameters

		# Execute the Athena query and get the execution ID for polling
		response = athena_client.start_query_execution(**start_query_args)
		query_execution_id: str = response["QueryExecutionId"]
		logger.info("Started Athena query %s", query_execution_id)

		# Poll until query completes, fails, or is cancelled
		poll_query_status(query_execution_id)
  
		logger.debug("Polling complete for query %s, fetching results", query_execution_id)

		# Fetch and format the query results
		rows = fetch_and_format_results(query_execution_id)

		logger.debug("Successfully fetched and formatted results for query %s, returning %d rows", 
               query_execution_id, len(rows))

		return {
			"statusCode": 200,
			"headers": {
				"Content-Type": "application/json",
				"Access-Control-Allow-Origin": "*",  # CORS
			},
			"body": json.dumps({"data": rows}),
		}

	except Exception as e:
		logger.exception("Unhandled error while processing request")
		return {
			"statusCode": 500,
			"headers": {"Content-Type": "application/json"},
			"body": json.dumps({"error": str(e)}),
		}
