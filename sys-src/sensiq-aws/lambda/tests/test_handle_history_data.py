import unittest
from unittest.mock import patch, MagicMock
import json

import os
import sys

# Add the lambda directory to the sys.path for history module import
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(current_dir, '..'))

from history.handle_history_data import build_query, poll_query_status, fetch_and_format_results, handler

class TestHandleHistoryData(unittest.TestCase):

    def test_build_query_defaults(self):
        """Test build_query with no parameters"""
        # Call the function with an empty dictionary to simulate no query parameters provided
        query, params = build_query({})
        
        # Assert that the default SQL query is returned exactly as expected
        self.assertEqual(query, "SELECT * FROM sensor_data ORDER BY timestamp DESC LIMIT 100")
        
        # Assert that the execution parameters list is empty since no dates were provided
        self.assertEqual(params, [])

    def test_build_query_with_limit_and_dates(self):
        """Test build_query with start/end dates and custom limit"""
        # Define a mock dictionary simulating API Gateway query string parameters
        query_params = {
            'limit': '50',
            'startDate': '2026-01-01T00:00:00Z',
            'endDate': '2026-12-31T23:59:59Z'
        }
        query, params = build_query(query_params)
        
        # Expected query includes 'CAST(? AS timestamp)' placeholders to prevent SQL injection
        expected_query = (
            "SELECT * FROM sensor_data WHERE timestamp >= CAST(? AS timestamp)" + 
            " AND timestamp <= CAST(? AS timestamp) ORDER BY timestamp DESC LIMIT 50"
        )
        self.assertEqual(query, expected_query)
        self.assertEqual(params, ['2026-01-01T00:00:00Z', '2026-12-31T23:59:59Z'])
        
    def test_build_query_invalid_limit(self):
        """Test build_query gracefully handles invalid limit parameter"""
        # Provide a non-integer string as the limit to trigger the ValueError handling
        query, params = build_query({'limit': 'invalid_string'})
        
        # Assert that the function gracefully falls back to the default limit (100)
        self.assertEqual(query, "SELECT * FROM sensor_data ORDER BY timestamp DESC LIMIT 100")
        self.assertEqual(params, [])

    def test_build_query_limit_boundaries(self):
        """Test build_query gracefully handles limits outside allowed range"""
        # Test lower boundary violation (0) -> defaults to 100
        query, params = build_query({'limit': '0'})
        self.assertEqual(query, "SELECT * FROM sensor_data ORDER BY timestamp DESC LIMIT 100")
        
        # Test lower boundary violation (negative) -> defaults to 100
        query, params = build_query({'limit': '-5'})
        self.assertEqual(query, "SELECT * FROM sensor_data ORDER BY timestamp DESC LIMIT 100")

        # Test upper boundary violation (> 1000) -> capped at 1000
        query, params = build_query({'limit': '1001'})
        self.assertEqual(query, "SELECT * FROM sensor_data ORDER BY timestamp DESC LIMIT 1000")

    # Mock time.sleep to run the test instantly without actually waiting
    @patch('history.handle_history_data.time.sleep', return_value=None)
    # Mock getting the query execution status from the boto3 Athena client
    @patch('history.handle_history_data.athena_client.get_query_execution')
    def test_poll_query_status_success(self, mock_get_query_execution, mock_sleep):
        """Test poll_query_status returns gracefully on SUCCEEDED"""
        # side_effect allows to return a sequence of different values on consecutive calls, 
        # simulating a real-world Athena query transitioning states over time.
        mock_get_query_execution.side_effect = [
            {'QueryExecution': {'Status': {'State': 'QUEUED'}}},
            {'QueryExecution': {'Status': {'State': 'QUEUED'}}},
            {'QueryExecution': {'Status': {'State': 'QUEUED'}}},
            {'QueryExecution': {'Status': {'State': 'RUNNING'}}},
            {'QueryExecution': {'Status': {'State': 'RUNNING'}}},
            {'QueryExecution': {'Status': {'State': 'SUCCEEDED'}}}
        ]
        
        # Run the polling function; if it raises an exception, the test will fail automatically
        poll_query_status('dummy_id')
        
        # Verify that the mocked get_query_execution was called exactly 6 times as per the side_effect sequence
        self.assertEqual(mock_get_query_execution.call_count, 6)

    @patch('history.handle_history_data.time.sleep', return_value=None)
    @patch('history.handle_history_data.athena_client.get_query_execution')
    def test_poll_query_status_failed(self, mock_get_query_execution, mock_sleep):
        """Test poll_query_status raises exception on FAILED"""
        # Simulate Athena returning a FAILED state in its metadata directly on the first check
        mock_get_query_execution.return_value = {
            'QueryExecution': {
                'Status': {
                    'State': 'FAILED',
                    'StateChangeReason': 'Syntax Error in SQL'
                }
            }
        }
        
        # Verify that calling poll_query_status correctly translates the FAILED state into a Python Exception
        with self.assertRaises(Exception) as context:
            poll_query_status('dummy_id')
            
        # Verify that the Exception message contains the reason provided by AWS Athena
        self.assertIn("Syntax Error in SQL", str(context.exception))

    @patch('history.handle_history_data.time.time')
    @patch('history.handle_history_data.athena_client.get_query_execution')
    def test_poll_query_status_timeout(self, mock_get_query_execution, mock_time):
        """Test poll_query_status raises exception on timeout"""
        # Simulate Athena query stuck in 'RUNNING' state endlessly
        mock_get_query_execution.return_value = {
            'QueryExecution': {'Status': {'State': 'RUNNING'}}
        }
        # time() returns 0 on assignment (start_time), and 26 on first while loop check.
        # This tricks the while loop into thinking 26 seconds have passed instantaneously, exceeding the 25s timeout.
        mock_time.side_effect = [0, 26]
        
        # Expect a timeout Exception to be raised instead of getting stuck in an infinite loop
        with self.assertRaises(Exception) as context:
            poll_query_status('dummy_id', timeout_seconds=25)
            
        # Verify the exception message accurately reflects the timeout
        self.assertIn("timed out after 25 seconds", str(context.exception))

    @patch('history.handle_history_data.athena_client.get_query_results')
    def test_fetch_and_format_results(self, mock_get_query_results):
        """Test output formatting parses standard Athena result sets correctly"""
        # Mock the complex nested JSON structure returned by AWS Athena API
        mock_get_query_results.return_value = {
            'ResultSet': {
                'ResultSetMetadata': {
                    'ColumnInfo': [
                        {'Name': 'timestamp'},
                        {'Name': 'dht_temperature'}
                    ]
                },
                'Rows': [
                    {'Data': [{'VarCharValue': 'timestamp'}, {'VarCharValue': 'dht_temperature'}]}, # Header row
                    {'Data': [{'VarCharValue': '2026-05-25T22:56:12Z'}, {'VarCharValue': '23.8'}]},  # Data row 1
                    {'Data': [{'VarCharValue': '2026-05-25T23:56:12Z'}, {'VarCharValue': '24.1'}]}   # Data row 2
                ]
            }
        }
        
        # Execute the formatting function against the mocked Athena response
        results = fetch_and_format_results('dummy_id')
        
        # Verify the header row was skipped and exactly 2 data rows were parsed
        self.assertEqual(len(results), 2)
        # Verify the list elements were properly transformed into a key-value dictionary using the ColumnInfo layout
        self.assertEqual(results[0]['timestamp'], '2026-05-25T22:56:12Z')
        self.assertEqual(results[0]['dht_temperature'], '23.8')
        self.assertEqual(results[1]['dht_temperature'], '24.1')

    @patch('history.handle_history_data.os.environ.get')
    @patch('history.handle_history_data.build_query')
    @patch('history.handle_history_data.athena_client.start_query_execution')
    @patch('history.handle_history_data.poll_query_status')
    @patch('history.handle_history_data.fetch_and_format_results')
    def test_handler_success(self, mock_fetch, mock_poll, mock_start, mock_build, mock_env):
        """Test full handler execution path on success"""
        # Mock environment variables injected by CDK (database and workgroup names)
        # Use a lambda to return different fake values depending on the environment variable requested.
        mock_env.side_effect = lambda key, default="": "test_wg" if key == "ATHENA_WORKGROUP" else "test_db"
        
        # Bypass the query building logic, forcing it to return a hardcoded tuple.
        # structure: (SQL query string, list of execution parameters) 
        mock_build.return_value = ("SELECT *", ["param1"])
        
        # Fake a successful Athena query startup by returning a dummy Execution ID.
        mock_start.return_value = {'QueryExecutionId': '12345'}
        
        # Provide a dummy parsed data list directly, bypassing the fetch formatting logic.
        mock_fetch.return_value = [{'temp': '20'}]
        
        # Create an empty API Gateway proxy event structure that lambda receives.
        event = {'queryStringParameters': {}}
        
        # Mock the Lambda context object with MagicMock, since the handler does not utilize it.
        context = MagicMock()
        
        # Run the primary lambda handler function.
        response = handler(event, context)
        
        # Validate that the method returned an HTTP 200 status format for AWS API Gateway.
        self.assertEqual(response['statusCode'], 200)
        
        # Confirm that the JSON body contains the mocked data payload.
        self.assertIn('data', json.loads(response['body']))
        
        # State Assertion: Verify that the start_query_execution boto3 method was called EXACTLY once 
        # with the exact parameters produced by the setup steps.
        mock_start.assert_called_once_with(
            QueryString="SELECT *",
            QueryExecutionContext={'Database': 'test_db'},
            WorkGroup='test_wg',
            ExecutionParameters=["param1"]
        )

    @patch('history.handle_history_data.os.environ.get')
    @patch('history.handle_history_data.build_query')
    def test_handler_exception(self, mock_build, mock_env):
        """Test handler properly deals with exceptions by returning status 500"""
        # Force the build_query step to raise an exception, preventing the rest of the execution
        mock_build.side_effect = Exception("Manual error trigger")
        
        event = {}
        
        # Call the handler with the forced exception
        response = handler(event, None)
        
        # The Lambda handler should gracefully intercept the exception and return a proxy response with a 500 Server Error
        self.assertEqual(response['statusCode'], 500)
        
        # Parse the JSON body and ensure it propagates the error context
        body = json.loads(response['body'])
        self.assertIn('error', body)
        self.assertEqual(body['error'], "Manual error trigger")

if __name__ == '__main__':
    unittest.main()
