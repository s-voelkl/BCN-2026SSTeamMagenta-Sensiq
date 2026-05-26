import os
import json
import time
import boto3
from typing import Any, Dict, List, Optional, Tuple

athena_client = boto3.client('athena')
MAX_RESULT_LIMIT = 1000
DEFAULT_RESULT_LIMIT = 100

def build_query(query_params: Dict[str, str]) -> Tuple[str, List[str]]:
    """
    Builds the SQL query and the execution parameters for Athena.

    Args:
        query_params (Dict[str, str]): Dictionary containing query parameters like 'limit', 'startDate', and 'endDate'.

    Returns:
        Tuple[str, List[str]]: A tuple containing the SQL query string and a list of execution parameters to prevent SQL injection.
    """
    limit: str = query_params.get('limit', str(DEFAULT_RESULT_LIMIT))
    start_date: Optional[str] = query_params.get('startDate')
    end_date: Optional[str] = query_params.get('endDate')
    
    # Validate and sanitize limit parameter
    try:
        limit_int: int = int(limit)
        if limit_int < 1:
            limit_int = DEFAULT_RESULT_LIMIT
        elif limit_int > MAX_RESULT_LIMIT:
            limit_int = MAX_RESULT_LIMIT
    except ValueError:
        limit_int = DEFAULT_RESULT_LIMIT
        
    query: str = "SELECT * FROM sensor_data"
    conditions: List[str] = []
    execution_parameters: List[str] = []
    
    # Use ExecutionParameters for parameterized queries to prevent SQL Injection
    if start_date:
        conditions.append("timestamp >= CAST(? AS timestamp)")
        execution_parameters.append(start_date)
    if end_date:
        conditions.append("timestamp <= CAST(? AS timestamp)")
        execution_parameters.append(end_date)
         
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
        
    query += f" ORDER BY timestamp DESC"
    query += f" LIMIT {limit_int}" 
    return query, execution_parameters

def poll_query_status(query_execution_id: str, timeout_seconds: int = 25) -> None:
    """
    Polls the Athena query until it completes, fails, or is cancelled.
    
    Possible states are: QUEUED, RUNNING, SUCCEEDED, FAILED, CANCELLED. 
    
    Raises an exception if the query fails or is cancelled.
    
    As the AWS API Gateway has a maximum timeout of 29 seconds, the default timeout 
    is set to 25 seconds to allow for some buffer.
    
    See: [Athena Query Execution](https://docs.aws.amazon.com/athena/latest/ug/querying.html#query-execution-states)

    Args:
        query_execution_id (str): The unique execution ID of the Athena query.
        timeout_seconds (int): The maximum seconds to wait before raising a timeout exception. Defaults to 25.

    Raises:
        Exception: If the query fails, is cancelled, or exceeds the timeout.
    """
    status: str = 'RUNNING'
    start_time = time.time() # current time in seconds since epoch
    
    while status in ['RUNNING', 'QUEUED']:
        if time.time() - start_time > timeout_seconds:
            raise Exception(f'Query timed out after {timeout_seconds} seconds')
            
        time.sleep(0.5) # Sleep for 500ms before polling again
        status_response = athena_client.get_query_execution(QueryExecutionId=query_execution_id)
        status = status_response['QueryExecution']['Status']['State']
        
        if status in ['FAILED', 'CANCELLED']:
            reason = status_response['QueryExecution']['Status'].get('StateChangeReason', 'Unknown reason')
            raise Exception(f'Query failed or cancelled: {reason}')

def fetch_and_format_results(query_execution_id: str) -> List[Dict[str, Any]]:
    """
    Fetches the query results from Athena and formats them into a list of dictionaries.
    
    Requires the query to have already completed successfully (e.g. by calling poll_query_status first).
    A strict implementation of the check was explicitly not added to avoid unnecessary API calls and latency.

    Args:
        query_execution_id (str): The unique execution ID of the Athena query.

    Returns:
        List[Dict[str, Any]]: A list of dictionaries representing the query result rows.
    """
    results_response = athena_client.get_query_results(
        QueryExecutionId=query_execution_id,
        MaxResults=MAX_RESULT_LIMIT
    )
    
    column_info = results_response['ResultSet']['ResultSetMetadata']['ColumnInfo']
    columns: List[str] = [col['Name'] for col in column_info]
    
    rows: List[Dict[str, Any]] = []
    for row in results_response['ResultSet']['Rows'][1:]: # skip header row
        data = row['Data']
        parsed_row: Dict[str, Any] = {}
        for idx, col in enumerate(columns):
            parsed_row[col] = data[idx].get('VarCharValue')
        rows.append(parsed_row)
        
    return rows

def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Lambda handler for querying historical IoT sensor data via Athena.
    
    Args:
        event (Dict[str, Any]): API Gateway proxy event containing optional queryStringParameters:
            - limit (str, optional): Max number of records to return (default 100).
            - startDate (str, optional): Start timestamp in ISO 8601 format (e.g. 2026-05-25T00:00:00Z).
            - endDate (str, optional): End timestamp in ISO 8601 format.
        context (Any): AWS Lambda context object providing runtime info.

    Returns:
        Dict[str, Any]: API Gateway proxy response with execution status and fetched data. 
            - 200: Successfully returned query results.
            - 500: Internal server error (e.g. query failed, cancelled, or code exception).
    """
    # Athena workgroup name, defined in the CDK stack as environment variable for the Lambda function
    athena_workgroup: str = os.environ.get('ATHENA_WORKGROUP', '')
    
    # Glue database name
    database_name: str = os.environ.get('DATABASE_NAME', '') 
    
    query_params: Dict[str, str] = event.get('queryStringParameters') or {}
    
    try:
        # Build the SQL query and execution parameters (if any, used against SQL injection)
        query, execution_parameters = build_query(query_params)
        
        # Start the Athena Query
        start_query_args: Dict[str, Any] = {
            'QueryString': query,
            'QueryExecutionContext': {'Database': database_name},
            'WorkGroup': athena_workgroup
        }
        if execution_parameters:
            start_query_args['ExecutionParameters'] = execution_parameters
            
        # Execute the Athena query and get the execution ID for polling
        response = athena_client.start_query_execution(**start_query_args)
        query_execution_id: str = response['QueryExecutionId']

        # Poll until query completes, fails, or is cancelled
        poll_query_status(query_execution_id)

        # Fetch and format the query results
        rows = fetch_and_format_results(query_execution_id)

        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*' # CORS
            },
            'body': json.dumps({'data': rows})
        }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': str(e)})
        }
