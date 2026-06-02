import json
import unittest
from unittest.mock import patch
import validation.handle_validation as handle_validation


class TestHandleValidation(unittest.TestCase):

    def _make_event(self, overrides=None):
        base = {
                "running_time": 111164587,
                "timestamp": "2026-05-28T00:39:39Z",
                "device_id": "esp32-lab-001",
                "location": "Lab A, OTH Amberg-Weiden, 92224 Amberg, Germany",
                "dht_humidity": 51,
                "dht_temperature": 25.1,
                "dht_heat_index": 24.99697,
                "flame_analog": 0,
                "flame_digital": False,
                "thermistor_analog": 2027,
                "thermistor_digital": False,
                "thermistor_temp": 24.5484,
                "topic": "sensiq/sensor-001/data"
        }
        return {**base, **(overrides or {})}

    def test_returns_200(self):
        response = handle_validation.handler(self._make_event(), {})
        self.assertEqual(response["statusCode"], 200)

    def test_logs_message(self):
        event = self._make_event()
        with patch("validation.handle_validation.logger") as mock_logger:
            handle_validation.handler(event, {})
            mock_logger.info.assert_called_once_with(
                "Received IoT message: %s", json.dumps(event)
            )

    def test_missing_fields_dont_crash(self):
        """Handler should not raise even with a minimal/empty payload."""
        response = handle_validation.handler({}, {})
        self.assertEqual(response["statusCode"], 200)


if __name__ == "__main__":
    unittest.main()