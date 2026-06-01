import json
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# import boto3
# dynamodb = boto3.resource('dynamodb')
# table = dynamodb.Table('YOUR_TABLE_NAME')  # TODO: replace with actual table name or env var


def handler(event, context):
    """
    IoT Core live rule Lambda handler.
    Validates incoming IoT messages and writes to DynamoDB with TTL for automatic expiration.
    """
    logger.info("Received IoT message: %s", json.dumps(event))

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

    return {"statusCode": 200, "body": "OK"}