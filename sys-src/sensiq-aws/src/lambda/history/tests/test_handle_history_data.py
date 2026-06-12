from history.handle_history_data import (
	build_query,
	poll_query_status,
	fetch_and_format_results,
	handler,
)

import unittest
from unittest.mock import patch, MagicMock
import json

import os
import sys

# Add the lambda directory to the sys.path for history module import
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(current_dir, ".."))


class TestHandleHistoryData(unittest.TestCase):
	def test_build_query_defaults(self):
		"""Test build_query with no parameters uses default lookback window for pruning"""
		query, params = build_query({})

		# No explicit date predicates, but partition predicate must be present and prune by year/month/day
		self.assertIn("SELECT * FROM sensor_data WHERE ", query)
		self.assertIn("(year, month, day) IN (", query)
		self.assertNotIn("from_iso8601_timestamp", query)
		self.assertTrue(query.endswith("ORDER BY timestamp DESC LIMIT 100"))
		self.assertEqual(params, [])

	def test_build_query_with_limit_and_dates(self):
		"""Test build_query with start/end dates and custom limit"""
		query_params = {
			"limit": "50",
			"startDate": "2026-01-01T00:00:00Z",
			"endDate": "2026-01-03T23:59:59Z",
		}
		query, params = build_query(query_params)

		# Partition predicate emitted as IN-list over concrete (year, month, day) tuples
		self.assertIn("(year, month, day) IN (", query)
		self.assertIn("('2026','01','01')", query)
		self.assertIn("('2026','01','02')", query)
		self.assertIn("('2026','01','03')", query)
		# Timestamp predicates use parameterised from_iso8601_timestamp(?)
		self.assertIn("timestamp >= from_iso8601_timestamp(?)", query)
		self.assertIn("timestamp <= from_iso8601_timestamp(?)", query)
		self.assertTrue(query.endswith("ORDER BY timestamp DESC LIMIT 50"))
		self.assertEqual(params, ["2026-01-01T00:00:00Z", "2026-01-03T23:59:59Z"])

	def test_build_query_wide_date_range_uses_year_bounds(self):
		"""Ranges > 366 days fall back to a year  BETWEEN predicate"""
		query, params = build_query({
			"startDate": "2024-01-01T00:00:00Z",
			"endDate": "2026-12-31T23:59:59Z",
		})
		self.assertIn("year BETWEEN '2024' AND '2026'", query)
		self.assertNotIn("(year, month, day) IN (", query)
		self.assertEqual(params, ["2024-01-01T00:00:00Z", "2026-12-31T23:59:59Z"])

	def test_build_query_invalid_limit(self):
		"""Test build_query gracefully handles invalid limit parameter"""
		query, params = build_query({"limit": "invalid_string"})

		self.assertIn("(year, month, day) IN (", query)
		self.assertTrue(query.endswith("ORDER BY timestamp DESC LIMIT 100"))
		self.assertEqual(params, [])

	def test_build_query_limit_boundaries(self):
		"""Test build_query gracefully handles limits outside allowed range"""
		query, _ = build_query({"limit": "0"})
		self.assertTrue(query.endswith("LIMIT 100"))

		query, _ = build_query({"limit": "-5"})
		self.assertTrue(query.endswith("LIMIT 100"))

		query, _ = build_query({"limit": "1001"})
		self.assertTrue(query.endswith("LIMIT 1000"))

	# Mock time.sleep to run the test instantly without actually waiting
	@patch("history.handle_history_data.time.sleep", return_value=None)
	# Mock getting the query execution status from the boto3 Athena client
	@patch("history.handle_history_data.athena_client.get_query_execution")
	def test_poll_query_status_success(self, mock_get_query_execution, mock_sleep):
		"""Test poll_query_status returns gracefully on SUCCEEDED"""
		# side_effect allows to return a sequence of different values on consecutive calls,
		# simulating a real-world Athena query transitioning states over time.
		mock_get_query_execution.side_effect = [
			{"QueryExecution": {"Status": {"State": "QUEUED"}}},
			{"QueryExecution": {"Status": {"State": "QUEUED"}}},
			{"QueryExecution": {"Status": {"State": "QUEUED"}}},
			{"QueryExecution": {"Status": {"State": "RUNNING"}}},
			{"QueryExecution": {"Status": {"State": "RUNNING"}}},
			{"QueryExecution": {"Status": {"State": "SUCCEEDED"}}},
		]

		# Run the polling function; if it raises an exception, the test will fail automatically
		poll_query_status("dummy_id")

		# Verify that the mocked get_query_execution was called exactly 6 times as per the side_effect sequence
		self.assertEqual(mock_get_query_execution.call_count, 6)

	@patch("history.handle_history_data.time.sleep", return_value=None)
	@patch("history.handle_history_data.athena_client.get_query_execution")
	def test_poll_query_status_failed(self, mock_get_query_execution, mock_sleep):
		"""Test poll_query_status raises exception on FAILED"""
		# Simulate Athena returning a FAILED state in its metadata directly on the first check
		mock_get_query_execution.return_value = {
			"QueryExecution": {
				"Status": {
					"State": "FAILED",
					"StateChangeReason": "Syntax Error in SQL",
				}
			}
		}

		# Verify that calling poll_query_status correctly translates the FAILED state into a Python Exception
		with self.assertRaises(Exception) as context:
			poll_query_status("dummy_id")

		# Verify that the Exception message contains the reason provided by AWS Athena
		self.assertIn("Syntax Error in SQL", str(context.exception))

	@patch("history.handle_history_data.time.time")
	@patch("history.handle_history_data.athena_client.get_query_execution")
	def test_poll_query_status_timeout(self, mock_get_query_execution, mock_time):
		"""Test poll_query_status raises exception on timeout"""
		# Simulate Athena query stuck in 'RUNNING' state endlessly
		mock_get_query_execution.return_value = {
			"QueryExecution": {"Status": {"State": "RUNNING"}}
		}
		# First time() call captures start_time (=0); every subsequent call returns 26,
		# so the elapsed-time check trips on the first loop iteration regardless of how
		# many time.time() calls the implementation makes per iteration (e.g. for logging).
		mock_time.side_effect = lambda: 0 if not mock_time.call_count_marker else 26
		# `side_effect` as a callable is invoked on every call; use a simple counter via
		# an attribute on the mock to differentiate the first call from the rest.
		mock_time.call_count_marker = 0
		def _fake_time():
			value = 0 if mock_time.call_count_marker == 0 else 26
			mock_time.call_count_marker += 1
			return value
		mock_time.side_effect = _fake_time

		# Expect a timeout Exception to be raised instead of getting stuck in an infinite loop
		with self.assertRaises(Exception) as context:
			poll_query_status("dummy_id", timeout_seconds=25)

		# Verify the exception message accurately reflects the timeout
		self.assertIn("timed out after 25 seconds", str(context.exception))

	@patch("history.handle_history_data.athena_client.get_query_results")
	def test_fetch_and_format_results(self, mock_get_query_results):
		"""Test output formatting parses standard Athena result sets correctly"""
		# Mock the complex nested JSON structure returned by AWS Athena API
		mock_get_query_results.return_value = {
			"ResultSet": {
				"ResultSetMetadata": {
					"ColumnInfo": [{"Name": "timestamp"}, {"Name": "dht_temperature"}]
				},
				"Rows": [
					{
						"Data": [
							{"VarCharValue": "timestamp"},
							{"VarCharValue": "dht_temperature"},
						]
					},  # Header row
					{
						"Data": [
							{"VarCharValue": "2026-05-25T22:56:12Z"},
							{"VarCharValue": "23.8"},
						]
					},  # Data row 1
					{
						"Data": [
							{"VarCharValue": "2026-05-25T23:56:12Z"},
							{"VarCharValue": "24.1"},
						]
					},  # Data row 2
				],
			}
		}

		# Execute the formatting function against the mocked Athena response
		results = fetch_and_format_results("dummy_id")

		# Verify the header row was skipped and exactly 2 data rows were parsed
		self.assertEqual(len(results), 2)
		# Verify the list elements were properly transformed into a key-value dictionary using the ColumnInfo layout
		self.assertEqual(results[0]["timestamp"], "2026-05-25T22:56:12Z")
		self.assertEqual(results[0]["dht_temperature"], "23.8")
		self.assertEqual(results[1]["dht_temperature"], "24.1")

	@patch("history.handle_history_data.os.environ.get")
	@patch("history.handle_history_data.build_query")
	@patch("history.handle_history_data.athena_client.start_query_execution")
	@patch("history.handle_history_data.poll_query_status")
	@patch("history.handle_history_data.fetch_and_format_results")
	def test_handler_success(
		self, mock_fetch, mock_poll, mock_start, mock_build, mock_env
	):
		"""Test full handler execution path on success"""
		# Mock environment variables injected by CDK (database and workgroup names)
		# Use a lambda to return different fake values depending on the environment variable requested.
		mock_env.side_effect = lambda key, default="": (
			"test_wg" if key == "ATHENA_WORKGROUP" else "test_db"
		)

		# Bypass the query building logic, forcing it to return a hardcoded tuple.
		# structure: (SQL query string, list of execution parameters)
		mock_build.return_value = ("SELECT *", ["param1"])

		# Fake a successful Athena query startup by returning a dummy Execution ID.
		mock_start.return_value = {"QueryExecutionId": "12345"}

		# Provide a dummy parsed data list directly, bypassing the fetch formatting logic.
		mock_fetch.return_value = [{"temp": "20"}]

		# Create an empty API Gateway proxy event structure that lambda receives.
		event = {"body": "{}"}

		# Mock the Lambda context object with MagicMock, since the handler does not utilize it.
		context = MagicMock()

		# Run the primary lambda handler function.
		response = handler(event, context)

		# Validate that the method returned an HTTP 200 status format for AWS API Gateway.
		self.assertEqual(response["statusCode"], 200)

		# Confirm that the JSON body contains the mocked data payload.
		self.assertIn("data", json.loads(response["body"]))

		# State Assertion: Verify that the start_query_execution boto3 method was called EXACTLY once
		# with the exact parameters produced by the setup steps.
		mock_start.assert_called_once_with(
			QueryString="SELECT *",
			QueryExecutionContext={"Database": "test_db"},
			WorkGroup="test_wg",
			ExecutionParameters=["param1"],
		)

	@patch("history.handle_history_data.os.environ.get")
	@patch("history.handle_history_data.build_query")
	def test_handler_exception(self, mock_build, mock_env):
		"""Test handler properly deals with exceptions by returning status 500"""
		# Force the build_query step to raise an exception, preventing the rest of the execution
		mock_build.side_effect = Exception("Manual error trigger")

		event = {}

		# Call the handler with the forced exception
		response = handler(event, None)

		# The Lambda handler should gracefully intercept the exception and return a proxy response with a 500 Server Error
		self.assertEqual(response["statusCode"], 500)

		# Parse the JSON body and ensure it propagates the error context
		body = json.loads(response["body"])
		self.assertIn("error", body)
		self.assertEqual(body["error"], "Manual error trigger")


if __name__ == "__main__":
	unittest.main()
