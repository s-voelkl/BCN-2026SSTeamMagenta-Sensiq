import json
import boto3
import os
import logging
from decimal import Decimal

logger = logging.getLogger()
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

dynamodb = boto3.resource('dynamodb')
TABLE_NAME = os.environ.get('TABLE_NAME', 'SensiqLiveState')

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)

def handler(event, context=None):
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

        if device_id:
            response = table.get_item(Key={'device_id': device_id})
            item = response.get('Item')

            if not item:
                logger.warning(f"No data: {device_id}")
                return {
                    'statusCode': 404,
                    'headers': headers,
                    'body': json.dumps({'message': 'Device not here'})
                }

            logger.info(f"Success: {device_id}")
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps(item, cls=DecimalEncoder)
            }

        else:
            response = table.scan(Limit=10)
            items = response.get('Items', [])

            logger.info(f"Success {len(items)} items from LiveDataDB")
            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps(items, cls=DecimalEncoder)
            }

    except Exception as e:
        logger.error(f"servererror: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': 'servererror'})
        }