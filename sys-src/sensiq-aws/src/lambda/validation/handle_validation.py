import json
import boto3
import os
import logging
from decimal import Decimal

logger = logging.getLogger()
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

dynamodb = boto3.resource('dynamodb')

# sns = boto3.client('sns')

TABLE_NAME = os.environ.get('TABLE_NAME', 'LiveDataDB')

# SNS_TOPIC_ARN = os.environ.get('SNS_TOPIC_ARN')

THRESHOLDS = {
    'dht_temperature': 30,
    'dht_humidity': 80,
    'flame_analog': 100,
    'thermistor_temp': 30
}

def handler(event, context=None):
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

        bereinigtes_item = {}
        for key, value in standardized_item.items():
            if value is not None:
                bereinigtes_item[key] = value
        standardized_item = bereinigtes_item
        alerts = []

        temp = standardized_item.get('dht_temperature')
        if temp is not None and float(temp) > THRESHOLDS['dht_temperature']:
            standardized_item['is_outlier'] = True
            alerts.append(f"Temperature too high: {temp}")

        humidity = standardized_item.get('dht_humidity')
        if humidity is not None and float(humidity) > THRESHOLDS['dht_humidity']:
            standardized_item['is_outlier'] = True
            alerts.append(f"Humidity too high: {humidity}")

        flame = standardized_item.get('flame_analog')
        if flame is not None and float(flame) > THRESHOLDS['flame_analog']:
            standardized_item['is_outlier'] = True
            alerts.append(f"Flame detected: {flame}")

        thermistor = standardized_item.get('thermistor_temp')
        if thermistor is not None and float(thermistor) > THRESHOLDS['thermistor_temp']:
            standardized_item['is_outlier'] = True
            alerts.append(f"Thermistor too high: {thermistor}")

        if standardized_item.get('is_outlier'):
            logger.warning(f"Outlier detected! Alerts: {alerts}")
       
        table = dynamodb.Table(TABLE_NAME)
        table.put_item(Item=standardized_item)
        logger.info(f"Data successfully saved to DynamoDB for: {device_id}")

        if standardized_item.get('is_outlier'):
             #if SNS_TOPIC_ARN:
                 #sns.publish(
                     #TopicArn=SNS_TOPIC_ARN,
                     #Subject="Sensiq Alarm",
                     #Message=f"Alarm: Device {device_id} reported an outlier! Details: {alerts}"
                 #)
                 logger.info("Outlier erkannt. SNS Alarm gesendet.")

        return {'statusCode': 200, 'body': 'ok'}

    except Exception as e:
        logger.error(f"Critical error: {str(e)}")
        return {'statusCode': 500, 'body': str(e)}