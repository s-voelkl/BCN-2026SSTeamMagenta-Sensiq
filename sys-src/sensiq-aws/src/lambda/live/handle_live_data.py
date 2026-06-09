import json
import logging
import os
from datetime import datetime, timezone
from decimal import Decimal

import boto3

# Log level can be overridden at runtime via the Lambda environment variable
# LOG_LEVEL (e.g. set to "DEBUG" in the AWS Console) without redeploying.
# Logs are available in CloudWatch under the SensiqLiveStack-HandleLiveData log group.
logger = logging.getLogger(__name__)
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

# TABLE_NAME is injected by the CDK stack (see sensiq-live-stack.ts).
TABLE_NAME = os.environ.get("TABLE_NAME", "LiveDataDB")
dynamodb = boto3.resource("dynamodb")

# Shared HTTP response headers, including the CORS settings required by the
# frontend to consume this endpoint through API Gateway.
RESPONSE_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
}

# A device is considered offline if its most recent sample is older than this
# threshold. Sensors are expected to publish at least once per minute, so five
# minutes provides a comfortable margin for transient network delays.
OFFLINE_THRESHOLD_SECONDS = 300
TIMESTAMP_FORMAT = "%Y-%m-%dT%H:%M:%SZ"

class DecimalEncoder(json.JSONEncoder):
    """JSON encoder that serializes DynamoDB ``Decimal`` values as floats."""

    def default(self, obj):
        """Override the default method to convert Decimal objects to floats for JSON serialization."""
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)


def _response(status_code: int, body: dict) -> dict:
    """Build an API Gateway proxy response using the shared headers."""
    return {
        "statusCode": status_code,
        "headers": RESPONSE_HEADERS,
        "body": json.dumps(body, cls=DecimalEncoder),
    }


def handler(event, context=None):
    """Return the latest sample for a device and report its online status.

    The function expects an API Gateway proxy event containing a ``device_id``
    query string parameter, looks up the matching item in the ``LiveDataDB``
    DynamoDB table, and decides whether the device is still considered online
    based on the age of its most recent timestamp.

    Response status codes:
        200: Device found and the latest sample is recent.
        400: The ``device_id`` query parameter is missing.
        404: No entry exists for the given device.
        437: Device is offline (last sample older than the threshold).
        500: Unexpected server-side or database error.
    """
    logger.info(f"Received request: {json.dumps(event)}")

    try:
        params = event.get("queryStringParameters") or {}
        device_id = params.get("device_id")

        if not device_id:
            logger.error("Missing device_id")
            return _response(400, {"error": "Missing required parameter: device_id"})

        # Retrieve the latest (only) item for the device from DynamoDB. 
        # Requires the table to have a device_id (partition key) and timestamp.
        table = dynamodb.Table(TABLE_NAME)
        item = table.get_item(Key={"device_id": device_id}).get("Item")

        if not item:
            logger.warning(f"No data: {device_id}")
            return _response(404, {"message": "No Entry found for this Device"})

        timestamp_str = item.get("timestamp")
        if timestamp_str:
            try:
                item_time = datetime.strptime(timestamp_str, TIMESTAMP_FORMAT).replace(
                    tzinfo=timezone.utc
                )
                age_seconds = (datetime.now(timezone.utc) - item_time).total_seconds()

                if age_seconds > OFFLINE_THRESHOLD_SECONDS:
                    logger.warning(
                        f"Device {device_id} is offline. Last seen: {timestamp_str}"
                    )
                    return _response(
                        437,
                        {"message": "Device is offline", "last_seen": timestamp_str},
                    )
            except ValueError as e:
                # Malformed timestamps are logged but do not fail the request;
                # the latest item is still returned so the client can react.
                logger.error(f"Timestamp parsing failed for {device_id}: {str(e)}")

        logger.info(f"Success: {device_id}")
        return _response(200, item)

    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return _response(500, {"error": "Internal server error"})