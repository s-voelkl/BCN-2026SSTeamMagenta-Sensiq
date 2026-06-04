import json
from datetime import datetime, timezone
from typing import Any, Dict

def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    path_parameters = event.get("pathParameters") or {}
    device_id = path_parameters.get("deviceId", "esp32-lab-01")

    body = {
        "running_time": 111164587,
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "device_id": "esp32-lab-001",
        "location": "Lab A, OTH Amberg-Weiden, 92224 Amberg, Germany",
        "dht_humidity": 51,
        "dht_temperature": 25.1,
        "dht_heat_index": 24.99697,
        "flame_analog": 0,
        "flame_digital": False,
        "thermistor_analog": 2027,
        "thermistor_digital": False,
        "thermistor_temp": 24.5484
    }

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        },
        "body": json.dumps(body)
    }
