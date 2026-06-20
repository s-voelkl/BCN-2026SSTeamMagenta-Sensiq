import json
import logging
import os
import time
from decimal import Decimal

import boto3

try:
    from .alert_email import render_alert_email
except ImportError:
    from alert_email import render_alert_email
    
# The log level can be changed at runtime without redeploying by setting the
# LOG_LEVEL environment variable on the Lambda function (e.g. to "DEBUG").
# Logs are available in CloudWatch under "SensiqLiveStack-HandleValidation...".
logger = logging.getLogger(__name__)
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

TABLE_NAME = os.environ.get("TABLE_NAME", "LiveDataDB")
ALERT_TOPIC_ARN = os.environ.get("ALERT_TOPIC_ARN")
SENT_EMAILS_TABLE_NAME = os.environ.get("SENT_EMAILS_TABLE_NAME")

# Minimum time between two alert emails for the same (device, reason) pair.
# Prevents email floods while a sensor value remains in a critical range.
EMAIL_COOLDOWN_SECONDS = 5 * 60

# Ruleset describing how each sensor field is validated. Adding a
# new sensor is a matter of appending an entry here; alert evaluation and
# email rendering both pick it up automatically.
# A range rule triggers when the numeric value leaves the closed interval
# [min, max]. An equals rule triggers when the value differs from
# expected.
# The rendering is done in alert_email.py for email formatting.
SENSOR_RULES: list[dict] = [
    {
        "field": "dht_temperature",
        "label": "DHT temperature",
        "unit": "\u00b0C",
        "type": "range",
        "min": 10,
        "max": 35,
        "too_high_reason": "Temperature too high",
        "too_low_reason": "Temperature too low",
    },
    {
        "field": "dht_humidity",
        "label": "DHT humidity",
        "unit": "%",
        "type": "range",
        "min": 20,
        "max": 80,
        "too_high_reason": "Humidity too high",
        "too_low_reason": "Humidity too low",
    },
    {
        "field": "flame_digital",
        "label": "Flame sensor",
        "unit": "",
        "type": "equals",
        "expected": False,
        "violation_reason": "Flame detected",
    },
    {
        "field": "flame_analog",
        "label": "Flame analog",
        "unit": "",
        "type": "range",
        "min": 0,
        "max": 3000,
        "too_high_reason": "Flame analog too high",
        "too_low_reason": "Flame analog not working (too low)",
    },
    {
        "field": "thermistor_temp",
        "label": "Thermistor temperature",
        "unit": "\u00b0C",
        "type": "range",
        "min": 10,
        "max": 35,
        "too_high_reason": "Temperature too high",
        "too_low_reason": "Temperature too low",
    },
    {
        "field": "bme_temperature",
        "label": "BME temperature",
        "unit": "\u00b0C",
        "type": "range",
        "min": 10,
        "max": 35,
        "too_high_reason": "Temperature too high",
        "too_low_reason": "Temperature too low",
    },
    {
        "field": "bme_humidity",
        "label": "BME humidity",
        "unit": "%",
        "type": "range",
        "min": 20,
        "max": 80,
        "too_high_reason": "Humidity too high",
        "too_low_reason": "Humidity too low",
    },
    {
        "field": "bme_pressure",
        "label": "BME pressure",
        "unit": "hPa",
        "type": "range",
        "min": 900,
        "max": 1100,
        "too_high_reason": "Pressure too high",
        "too_low_reason": "Pressure too low",
    },
    {
        "field": "bme_altitude",
        "label": "BME altitude",
        "unit": "m",
        "type": "range",
        "min": 0,
        "max": 4000,
        "too_high_reason": "Altitude too high",
        "too_low_reason": "Altitude too low",
    },
    {
        "field": "bme_voc",
        "label": "BME VOC",
        "unit": "ppb",
        "type": "range",
        "min": 0,
        "max": 500,
        "too_high_reason": "VOC too high",
        "too_low_reason": "VOC too low",
    },
    {
        "field": "tsl_lux",
        "label": "TSL Light Intensity",
        "unit": "lux",
        "type": "range",
        "min": 0,
        "max": 1000,
        "too_high_reason": "Light intensity too high",
        "too_low_reason": "Light intensity too low",
    },
]

# Fields forwarded from the raw IoT payload to DynamoDB. Anything not listed
# here is dropped, which keeps unexpected payload keys out of the table.
ALLOWED_FIELDS = (
    "location",
    "dht_temperature",
    "dht_humidity",
    "dht_heat_index",
    "flame_digital",
    "flame_analog",
    "thermistor_temp",
    "bme_temperature",
    "bme_humidity",
    "bme_pressure",
    "bme_altitude",
    "bme_voc",
    "tsl_lux",
)

# aws clients
sns_client = boto3.client("sns")
dynamodb = boto3.resource("dynamodb")

sent_emails_table = (
    dynamodb.Table(SENT_EMAILS_TABLE_NAME) if SENT_EMAILS_TABLE_NAME else None
)

def should_send_alert(device_id: str, reason: str, current_timestamp: int) -> bool:
    """Return ``True`` when an alert for ``(device_id, reason)`` is not in cooldown.

    The cooldown state is read from the ``sensiq-email-list-sent-mails`` table.
    If the cooldown table is not configured, alerts are always sent.
    
    Parameters:
        device_id: The ID of the device sending the alert (e.g. "esp32-lab-001")
        reason: The human-readable reason for the alert (e.g. "DHT temperature too high")
        current_timestamp: The current time as a UNIX timestamp (e.g. 1697055600)
        
    Returns:
        True if an alert should be sent (i.e. no recent alert for the same device and reason), 
            False if the alert is in cooldown.
    """
    if sent_emails_table is None:
        logger.warning(
            "SENT_EMAILS_TABLE_NAME is not configured, sending alert without cooldown"
        )
        return True

    response = sent_emails_table.get_item(
        Key={"device_id": device_id, "reason": reason}
    )

    item = response.get("Item")
    if not item:
        return True

    # new message possible if last sent was more than EMAIL_COOLDOWN_SECONDS ago
    last_sent_timestamp = int(item.get("timestamp", 0))
    return current_timestamp - last_sent_timestamp >= EMAIL_COOLDOWN_SECONDS


def mark_alert_as_sent(device_id: str, reason: str, current_timestamp: int) -> None:
    """Record the time at which an alert was sent for ``(device_id, reason)``.

    A single entry is kept per ``(device_id, reason)`` and overwritten on every
    successful publish, which is sufficient to enforce the cooldown window.
    
    Parameters:
        device_id: The ID of the device sending the alert (e.g. "esp32-lab-001")
        reason: The human-readable reason for the alert (e.g. "DHT temperature too high")
        current_timestamp: The current time as a UNIX timestamp (e.g. 1697055600)
        
    Returns:
        None
    """
    if sent_emails_table is None:
        logger.warning(
            "SENT_EMAILS_TABLE_NAME is not configured, skipping cooldown update"
        )
        return

    # Upserting timestamp for the (device_id, reason) pair
    sent_emails_table.put_item(
        Item={
            "device_id": device_id,
            "reason": reason,
            "timestamp": current_timestamp,
        }
    )

def evaluate_rule(rule: dict, value) -> str | None:
    """Apply a single sensor rule and return a violation reason, if any.

    Returns ``None`` when the value satisfies the rule or cannot be evaluated
    (e.g. a missing or unparsable numeric value for a range rule).
    
    Parameters:
        rule (dict): A dictionary representing the validation rule, which must contain a 
            "type" key and other keys depending on the type (e.g. "min" and "max" for a "range" rule).
        value: The raw value to validate, which may be of any type depending on the sensor data.
        
    Returns:
        str | None: A human-readable reason describing the violation if the rule is not satisfied,
            or None if the value satisfies the rule or cannot be evaluated.
    """
    if value is None:
        return None

    rule_type = rule["type"]

    if rule_type == "range":
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            return None
        
        if numeric > rule["max"]:
            return rule["too_high_reason"]
        
        if numeric < rule["min"]:
            return rule["too_low_reason"]
        return None

    if rule_type == "equals":
        if value != rule["expected"]:
            return rule["violation_reason"]
        return None

    return None


def get_alert_reasons(sensor_data: dict) -> list[str]:
    """Return the human-readable reasons describing critical readings.

    An empty list means the payload is within acceptable bounds for every
    configured rule in :data:`SENSOR_RULES`.
    
    Parameters:
        sensor_data (dict): The raw payload from the IoT device, as a dictionary.
        
    Returns:
        list[str]: A list of human-readable reasons describing why ``sensor_data`` is critical.
    """
    reasons: list[str] = []
    
    for rule in SENSOR_RULES:
        reason = evaluate_rule(rule, sensor_data.get(rule["field"]))
        
        if reason:
            reasons.append(reason)
            
    return reasons


def publish_alert(sensor_data: dict, reasons: list[str]) -> None:
    """Publish a user-friendly alert message for ``sensor_data`` to SNS.
    
    Parameters:
        sensor_data (dict): The raw payload from the IoT device, as a dictionary.
        reasons (list[str]): A list of human-readable reasons describing why ``sensor_data`` is critical.
        
    Returns:
        None    
    """
    if not ALERT_TOPIC_ARN:
        logger.warning("ALERT_TOPIC_ARN is not configured, skipping SNS alert")
        return

    subject, body = render_alert_email(
        sensor_data, reasons, SENSOR_RULES, evaluate_rule
    )

    sns_client.publish(
        TopicArn=ALERT_TOPIC_ARN,
        Subject=subject,
        Message=body,
    )

    logger.info(
        "Published SNS alert for device %s: %s",
        sensor_data.get("device_id", "unknown-device"),
        reasons,
    )


def process_alerts(event: dict, device_id: str, current_timestamp: int) -> list[str]:
    """Evaluate ``event`` for alert conditions, publish them and update cooldown state.

    Returns the full list of detected alert reasons regardless of cooldown so the
    caller can include it in the handler response.
    
    Parameters:
        event: The raw payload from the IoT device, as a dictionary.
        device_id: The ID of the device sending the alert (e.g. "esp32-lab-001")
        current_timestamp: The current time as a UNIX timestamp (e.g. 1697055600)
        
    Returns:
        list[str]: A list of human-readable reasons describing why ``event`` is critical.
    """
    alert_reasons = get_alert_reasons(event)

    reasons_to_send = [
        reason
        for reason in alert_reasons
        if should_send_alert(device_id, reason, current_timestamp)
    ]

    if not reasons_to_send:
        if alert_reasons:
            logger.debug(
                "All alert reasons are currently in cooldown for device %s", device_id
            )
        return alert_reasons

    publish_alert(event, reasons_to_send)
    for reason in reasons_to_send:
        mark_alert_as_sent(device_id, reason, current_timestamp)

    return alert_reasons


def build_live_item(event: dict) -> dict:
    """Build the DynamoDB item for the live table from a raw IoT ``event``.

    Floats are converted to ``Decimal`` (required by DynamoDB) and only fields
    listed in :data:`ALLOWED_FIELDS` are forwarded, alongside the mandatory
    ``device_id`` and ``timestamp`` keys.
    
    Parameters:
        event: The raw payload from the IoT device, as a dictionary.
        
    Returns:
        dict: A dictionary representing the DynamoDB item to be stored for the live data.
    """
    raw_item = json.loads(json.dumps(event), parse_float=Decimal)

    item = {
        "device_id": raw_item.get("device_id"),
        "timestamp": raw_item.get("timestamp"),
    }
    for field in ALLOWED_FIELDS:
        value = raw_item.get(field)
        if value is not None:
            item[field] = value

    return item

def handler(event, context):
    """Lambda entry point for the IoT live rule.

    Evaluates ``event`` for alert conditions, publishes any new alerts to SNS
    and stores the latest reading in DynamoDB. Returns an API-Gateway-style
    response describing the outcome.
    
    Parameters:
        event: The raw payload from the IoT device, as a dictionary.
        context: The Lambda execution context (not used in this function).
        
    Returns:
        dict: An API-Gateway-style response with "statusCode" and "body" keys.
    """
    logger.info(f"Received event: {json.dumps(event)}")

    try:
        device_id = event.get("device_id")
        current_timestamp = int(time.time())

        alert_reasons = process_alerts(event, device_id, current_timestamp)

        item = build_live_item(event)
        if not item["device_id"] or not item["timestamp"]:
            logger.error("Missing timestamp or device_id")
            return {
                "statusCode": 400,
                "body": "device_id or timestamp is missing",
            }

        dynamodb.Table(TABLE_NAME).put_item(Item=item)
        logger.info(f"Data successfully saved to DynamoDB for: {device_id}")

        return {
            "statusCode": 200,
            "body": json.dumps(
                {
                    "message": "Validation completed",
                    "alert_reasons": alert_reasons,
                }
            ),
        }

    except Exception as e:
        logger.error(f"Critical error: {str(e)}")
        return {"statusCode": 500, "body": str(e)}
