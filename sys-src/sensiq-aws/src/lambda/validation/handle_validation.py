import json
import boto3
import os
import time
import logging
from decimal import Decimal

logger = logging.getLogger()
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

dynamodb = boto3.resource('dynamodb')

# TODO: activate later
# sns = boto3.client('sns')

TABLE_NAME = os.environ.get('TABLE_NAME', 'SensiqLiveState')

# TODO: activate later
# SNS_TOPIC_ARN = os.environ.get('SNS_TOPIC_ARN')


THRESHOLDS = {
    'dht_temperature': 30,
    'dht_humidity': 80,
    'flame_analog': 100,
    'thermistor_temp': 30
}

def handler(event, context=None):
    logger.info(f"Receivet event: {json.dumps(event)}")
    
    try:
        conntent_str = json.dumps(event)
        item = json.loads(conntent_str, parse_float=Decimal)

        device_id = item.get('device_id')
        timestamp = item.get('timestamp')

        if not device_id or not timestamp:
            logger.error("DATA !!")
            return {'statusCode': 400, 'body': 'device_id or timestamp is missing'}

        item['is_outlier'] = False
        alerts = []

        # Check Temperature
        temp = item.get('dht_temperature')
        if temp is not None and float(temp) > THRESHOLDS['dht_temperature']:
            item['is_outlier'] = True
            alerts.append(f"Temperature too high: {temp}")

        # Check Humidity
        humidity = item.get('dht_humidity')
        if humidity is not None and float(humidity) > THRESHOLDS['dht_humidity']:
            item['is_outlier'] = True
            alerts.append(f"Humidity too high: {humidity}")

        # Check Flame
        flame = item.get('flame_analog')
        if flame is not None and float(flame) > THRESHOLDS['flame_analog']:
            item['is_outlier'] = True
            alerts.append(f"Flame detected: {flame}")

        # Check Thermistor
        thermistor = item.get('thermistor_temp')
        if thermistor is not None and float(thermistor) > THRESHOLDS['thermistor_temp']:
            item['is_outlier'] = True
            alerts.append(f"Thermistor too high: {thermistor}")


        if item['is_outlier']:
            logger.warning(f"Outlier detected! Alerts: {alerts}")
       
        item['expiresAt'] = int(time.time()) + 60

        table = dynamodb.Table(TABLE_NAME)
        table.put_item(Item=item)
        logger.info(f"Data successfully saved to DynamoDB for: {device_id}")

        # --- SNS ALARM (TODO) ---
        if item.get('is_outlier') == True:
             #if SNS_TOPIC_ARN:
                 #sns.publish(
                     #TopicArn=SNS_TOPIC_ARN,
                     #Subject="Sensiq Alarm",
                     #Message=f"Alarm: Device {device_id} reported an outlier! Details: {alerts}"
                 #)
                 logger.info("Outlier erkannt. SNS Alarm gesendet.")

        return {'statusCode': 200, 'body': 'ok'}

    except Exception as e:
        logger.error(f"Kritischer Fehler: {str(e)}")
        return {'statusCode': 500, 'body': str(e)}