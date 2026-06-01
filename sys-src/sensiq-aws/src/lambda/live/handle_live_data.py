import json
from datetime import datetime, timezone
from typing import Any, Dict

def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    path_parameters = event.get("pathParameters") or {}
    device_id = path_parameters.get("deviceId", "esp32-lab-01")

    body = {
        "deviceId": device_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "location": "Lab A",
        "measurements": {
            "dht11_temperature": {
                "value": 20,
                "unit": "°C"
            },
            "dht11_humidity": {
                "value": 50,
                "unit": "%"
            },
            "flame_analog": {
                "value": 4000,
                "unit": "adc"
            }
        }
    }

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        },
        "body": json.dumps(body)
    }
