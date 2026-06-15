import json
import logging
import os
from decimal import Decimal

import boto3

# Log level can be overridden at runtime via the Lambda environment variable
# LOG_LEVEL (e.g. set to "DEBUG" in the AWS Console) without redeploying.
# Logs are available in CloudWatch under the SensiqLiveStack-HandleValidation log group.
logger = logging.getLogger(__name__)
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

# TABLE_NAME is injected by the CDK stack (see sensiq-live-stack.ts).
TABLE_NAME = os.environ.get("TABLE_NAME", "LiveDataDB")
dynamodb = boto3.resource("dynamodb")

# Fields forwarded from the raw IoT payload to DynamoDB. 
# Any field not listed here is dropped, which keeps unexpected payload keys out of the table.
ALLOWED_FIELDS = (
    "location",
    "dht_temperature",
    "dht_humidity",
    "dht_heat_index",
    "flame_analog",
    "thermistor_temp",
)


def handler(event, context=None):
    """Validate an incoming IoT sensor payload and persist it to DynamoDB.

    Triggered by the ``sensiq/+/data`` IoT Topic Rule defined in
    ``sensiq-live-stack.ts``. The event is the raw MQTT message published by
    the ESP32 device. Float values are decoded as ``Decimal`` so they can be
    written to DynamoDB without precision loss, and ``None`` fields are
    stripped before writing.

    Response status codes:
        200: Payload accepted and stored.
        400: ``device_id`` or ``timestamp`` is missing from the payload.
        500: Unexpected processing or database error.
    """
    logger.info(f"Received event: {json.dumps(event)}")

    try:
        # Re-parse through json so nested floats are converted to Decimal,
        # which is the type DynamoDB requires for numeric attributes.
        raw_item = json.loads(json.dumps(event), parse_float=Decimal)

        device_id = raw_item.get("device_id")
        timestamp = raw_item.get("timestamp")

        if not device_id or not timestamp:
            logger.error("Missing timestamp or device_id")
            return {"statusCode": 400, "body": "device_id or timestamp is missing"}

        # Only include allowed fields in the DynamoDB item, which also filters out any None values.
        # The device_id and timestamp are required and always included, while the other fields are optional.
        item = {"device_id": device_id, "timestamp": timestamp}
        for field in ALLOWED_FIELDS:
            value = raw_item.get(field)
            if value is not None:
                item[field] = value

        # Write the validated item to DynamoDB. 
        # Requires the table to have a device_id (partition key) and timestamp.
        dynamodb.Table(TABLE_NAME).put_item(Item=item)
        logger.info(f"Data successfully saved to DynamoDB for: {device_id}")

        return {"statusCode": 200, "body": "ok"}

    except Exception as e:
        logger.error(f"Critical error: {str(e)}")
        return {"statusCode": 500, "body": str(e)}