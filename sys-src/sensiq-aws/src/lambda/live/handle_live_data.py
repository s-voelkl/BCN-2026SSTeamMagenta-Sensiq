import json
import boto3
import os
import logging
from decimal import Decimal
from datetime import datetime, timezone

logger = logging.getLogger()
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

dynamodb = boto3.resource('dynamodb')
TABLE_NAME = os.environ.get('TABLE_NAME', 'LiveDataDB')

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)

def handler(event, context=None):
    """
    This Lamda Function retrieves the latest device data from DynamoDB and checks if the device is online based on its timestamp.

    Return Values (HTTP Status Codes):
    - 200: Success (Data found and device is online)
    - 400: Bad Request (Missing 'device_id')
    - 404: Not Found (No entry for this ID)
    - 437: Device Offline (Timestamp older than 6 minutes)
    - 500: Internal Server Error (Database or system issues)
    """
    
    logger.info(f"Received request: {json.dumps(event)}")
    
    headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
    }

    try:
        table = dynamodb.Table(TABLE_NAME)
        
        params = event.get('queryStringParameters') or {}
        device_id = params.get('device_id')

        #Checking if a device ID exists
        if device_id:
            response = table.get_item(Key={'device_id': device_id})
            item = response.get('Item')
            
            #Check if device is present
            if not item:
                logger.warning(f"No data: {device_id}")
                return {
                    'statusCode': 404,
                    'headers': headers,
                    'body': json.dumps({'message': 'No Entry found for this Device'})
                }
            timestamp_str = item.get('timestamp')
            if timestamp_str:
                try:
                    item_time = datetime.strptime(timestamp_str, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
                    now = datetime.now(timezone.utc)
                    
                    # Device data not up to date, device offline
                    if (now - item_time).total_seconds() > 360:
                        logger.warning(f"Device {device_id} is offline. Last seen: {timestamp_str}")
                        return {
                            'statusCode': 437,
                            'headers': headers,
                            'body': json.dumps({'message': 'Device is offline'})
                        }
                except ValueError as e:
                    logger.error(f"Timestamp parsing failed for {device_id}: {str(e)}")
            # Device found and still up-to-date
            logger.info(f"Success: {device_id}")
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps(item, cls=DecimalEncoder)
            }
        # Error due to missing device ID
        else:
            logger.error("Missing device_id")
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'Missing required parameter: device_id'})
            }


    
    
#Error occurs as if the iam role is missing
    except Exception as e:
        logger.error(f"servererror: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': 'servererror'})
        }