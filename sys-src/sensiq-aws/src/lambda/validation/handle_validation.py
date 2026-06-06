import json
import logging
import os

import boto3

logger = logging.getLogger(__name__)
# Can be set to DEBUG via Console to mitigate re-deployments for debugging purposes.
# ENV: Lambda > Specific Lambda Function > Environment Variables > LOG_LEVEL = DEBUG / INFO
# Logs: CloudWatch > Log management > SensiqHistoryStack-HandleValidation...
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

sns_client = boto3.client("sns")
ALERT_TOPIC_ARN = os.environ.get("ALERT_TOPIC_ARN")

# import boto3
# dynamodb = boto3.resource('dynamodb')
# table = dynamodb.Table('YOUR_TABLE_NAME')  # TODO: replace with actual table name or env var

def publish_alert(sensor_data: dict, reason: str) -> None:
    """Publish a sensor alert to SNS."""
    if not ALERT_TOPIC_ARN:
        logger.warning("ALERT_TOPIC_ARN is not configured, skipping SNS alert")
        return

    device_id = sensor_data.get("device_id", "unknown-device")
    location = sensor_data.get("location", "unknown-location")
    timestamp = sensor_data.get("timestamp", "unknown-time")

    message = {
        "reason": reason,
        "device_id": device_id,
        "location": location,
        "timestamp": timestamp,
        "sensor_data": sensor_data,
    }

    sns_client.publish(
        TopicArn=ALERT_TOPIC_ARN,
        Subject=f"Sensiq Alert: {reason}",
        Message=json.dumps(message, indent=2),
    )

    logger.info("Published SNS alert for device %s: %s", device_id, reason)


def get_alert_reasons(sensor_data: dict) -> list[str]:
    """Return alert reasons for critical sensor values."""
    reasons = []

    if sensor_data.get("flame_digital") is True:
        reasons.append("Flame detected")

    dht_temperature = sensor_data.get("dht_temperature")
    if dht_temperature is not None and float(dht_temperature) > 35:
        reasons.append("DHT temperature too high")

    thermistor_temp = sensor_data.get("thermistor_temp")
    if thermistor_temp is not None and float(thermistor_temp) > 35:
        reasons.append("Thermistor temperature too high")

    dht_humidity = sensor_data.get("dht_humidity")
    if dht_humidity is not None and float(dht_humidity) > 80:
        reasons.append("Humidity too high")

    if sensor_data.get("is_outlier") is True:
        reasons.append("Sensor outlier detected")

    return reasons

def handler(event, context):
    """
    IoT Core live rule Lambda handler.
    Validates incoming IoT messages and writes to DynamoDB with TTL for automatic expiration.
    """
    logger.info("Received IoT message: %s", json.dumps(event))

    alert_reasons = get_alert_reasons(event)

    for reason in alert_reasons:
        publish_alert(event, reason)


    # TODO: extract fields once message schema is defined, e.g.:
    # device_id = event.get('device_id')
    # timestamp = event.get('timestamp')
    # payload   = event.get('payload')

    # TTL_SECONDS = 30 # Example TTL for DynamoDB items (30 seconds)

    # --- DynamoDB write (placeholder) ---
    # item = {
    #     'pk': event.get('device_id', 'unknown'),   # TODO: define partition key
    #     'sk': event.get('timestamp', 'unknown'),   # TODO: define sort key
    #     'expires_at': int(time.time()) + TTL_SECONDS,   
    #     **event                                    # writes all fields from the message
    # }
    # try:
    #     table.put_item(Item=item)
    #     logger.info("Written to DynamoDB: %s", json.dumps(item))
    # except Exception as e:
    #     logger.error("Failed to write to DynamoDB: %s", str(e))
    #     raise

    return {
        "statusCode": 200,
        "body": json.dumps({
            "message": "Validation completed",
            "alert_reasons": alert_reasons,
        }),
    }
