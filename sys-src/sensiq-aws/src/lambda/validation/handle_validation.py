import json
import boto3
import os
import logging
from decimal import Decimal

logger = logging.getLogger()
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

dynamodb = boto3.resource('dynamodb')

TABLE_NAME = os.environ.get('TABLE_NAME', 'LiveDataDB')

def handler(event, context=None):

    """
    This Lambda function processes incoming sensor data and saves the cleaned records to DynamoDB.

    Return Values (HTTP Status Codes):
    - 200: Success (Data successfully processed and saved)
    - 400: Bad Request (Missing required 'device_id' or 'timestamp')
    - 500: Internal Server Error (Critical processing or database error)
    """

    logger.info(f"Received event: {json.dumps(event)}")

    try:
        content_str = json.dumps(event)
        raw_item = json.loads(content_str, parse_float=Decimal)

        device_id = raw_item.get('device_id')
        timestamp = raw_item.get('timestamp')

        if not device_id or not timestamp:
            logger.error("Missing timestamp or device_id")
            return {'statusCode': 400, 'body': 'device_id or timestamp is missing'}

        standardized_item = {
            'device_id': device_id,
            'timestamp': timestamp,
            'location': raw_item.get('location'),
            'dht_temperature': raw_item.get('dht_temperature'),
            'dht_humidity': raw_item.get('dht_humidity'),
            'dht_heat_index': raw_item.get('dht_heat_index'),
            'flame_analog': raw_item.get('flame_analog'),
            'thermistor_temp': raw_item.get('thermistor_temp'),
        }

        cleaned_item = {}
        for key, value  in standardized_item.items():
            if value  is not None:
                cleaned_item[key] = value 
        standardized_item = cleaned_item

        table = dynamodb.Table(TABLE_NAME)
        table.put_item(Item=standardized_item)
        logger.info(f"Data successfully saved to DynamoDB for: {device_id}")

        return {'statusCode': 200, 'body': 'ok'}

    except Exception as e:
        logger.error(f"Critical error: {str(e)}")
        return {'statusCode': 500, 'body': str(e)}