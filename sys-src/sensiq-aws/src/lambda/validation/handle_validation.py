import json
import logging
import os
import time

import boto3

logger = logging.getLogger(__name__)
# Can be set to DEBUG via Console to mitigate re-deployments for debugging purposes.
# ENV: Lambda > Specific Lambda Function > Environment Variables > LOG_LEVEL = DEBUG / INFO
# Logs: CloudWatch > Log management > SensiqHistoryStack-HandleValidation...
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

sns_client = boto3.client("sns")
dynamodb = boto3.resource("dynamodb")

ALERT_TOPIC_ARN = os.environ.get("ALERT_TOPIC_ARN")
SENT_EMAILS_TABLE_NAME = os.environ.get("SENT_EMAILS_TABLE_NAME")

# Do not send the same alert email for the same device and reason within this time window
EMAIL_COOLDOWN_SECONDS = 5 * 60

sent_emails_table = (
    dynamodb.Table(SENT_EMAILS_TABLE_NAME)
    if SENT_EMAILS_TABLE_NAME
    else None
)

def should_send_alert(device_id: str, reason: str, current_timestamp: int) -> bool:
    """Return True if no alert email was sent recently for this device and reason."""
    if sent_emails_table is None:
        logger.warning("SENT_EMAILS_TABLE_NAME is not configured, sending alert without cooldown")
        return True

    # Check if the alert has already been sent recently
    response = sent_emails_table.get_item(
        Key={
            "device_id": device_id,
            "reason": reason,
        }
    )

    item = response.get("Item")
    if not item:
        return True

    # Compare the current timestamp with the last sent timestamp
    last_sent_timestamp = int(item.get("timestamp", 0))
    return current_timestamp - last_sent_timestamp >= EMAIL_COOLDOWN_SECONDS

def mark_alert_as_sent(device_id: str, reason: str, current_timestamp: int) -> None:
    """Store the latest sent timestamp for a device and alert reason."""
    if sent_emails_table is None:
        logger.warning("SENT_EMAILS_TABLE_NAME is not configured, skipping cooldown update")
        return

    # Store one cooldown entry per device and reason
    sent_emails_table.put_item(
        Item={
            "device_id": device_id,
            "reason": reason,
            "timestamp": current_timestamp,
        }
    )

def publish_alert(sensor_data: dict, reasons: list[str]) -> None:
    """Publish a sensor alert to SNS."""
    if not ALERT_TOPIC_ARN:
        logger.warning("ALERT_TOPIC_ARN is not configured, skipping SNS alert")
        return

    device_id = sensor_data.get("device_id", "unknown-device")
    location = sensor_data.get("location", "unknown-location")
    timestamp = sensor_data.get("timestamp", "unknown-time")

    message = {
        "alert_reasons": reasons,
        "device_id": device_id,
        "location": location,
        "timestamp": timestamp,
        "sensor_data": sensor_data,
    }

    sns_client.publish(
        TopicArn=ALERT_TOPIC_ARN,
        Subject=f"Sensiq Alert: {len(reasons)} critical condition(s)",
        Message=json.dumps(message, indent=2),
    )

    logger.info("Published SNS alert for device %s: %s", device_id, reasons)


def get_alert_reasons(sensor_data: dict) -> list[str]:
    """Return alert reasons for critical sensor values."""
    reasons = []

    if sensor_data.get("flame_digital") is True:
        reasons.append("Flame detected")

    dht_temperature = sensor_data.get("dht_temperature")
    if dht_temperature is not None and float(dht_temperature) > 30:
        reasons.append("DHT temperature too high")

    thermistor_temp = sensor_data.get("thermistor_temp")
    if thermistor_temp is not None and float(thermistor_temp) > 30:
        reasons.append("Thermistor temperature too high")

    dht_humidity = sensor_data.get("dht_humidity")
    if dht_humidity is not None and float(dht_humidity) > 80:
        reasons.append("Humidity too high")

    return reasons

def handler(event, context):
    """
    IoT Core live rule Lambda handler.
    Validates incoming IoT messages and writes to DynamoDB with TTL for automatic expiration.
    """
    logger.info("Received IoT message: %s", json.dumps(event))

    device_id = event.get("device_id")
    current_timestamp = int(time.time())

    # Collect alert reasons
    alert_reasons = get_alert_reasons(event)

    # Only send alerts if not blocked by cooldown
    reasons_to_send = [
        reason
        for reason in alert_reasons
        if should_send_alert(device_id, reason, current_timestamp)
    ]

    if reasons_to_send:
        publish_alert(event, reasons_to_send)

        # Store the send time after publishing the email.
        for reason in reasons_to_send:
            mark_alert_as_sent(device_id, reason, current_timestamp)
    else:
        logger.debug("All alert reasons are currently in cooldown for device %s", device_id)


    #if alert_reasons:
    #    publish_alert(event, alert_reasons)


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
