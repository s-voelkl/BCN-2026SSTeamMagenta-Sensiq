import json
import unittest
from unittest.mock import patch, MagicMock
import validation.handle_validation as handle_validation


class TestHandleValidation(unittest.TestCase):

    def setUp(self):
        self.mock_context = MagicMock()

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

    @patch("validation.handle_validation.dynamodb")
    def test_returns_200(self, mock_dynamodb):
        response = handle_validation.handler(self._make_event(), self.mock_context)
        self.assertEqual(response["statusCode"], 200)
        mock_dynamodb.Table.return_value.put_item.assert_called_once()

    @patch("validation.handle_validation.dynamodb")
    def test_logs_message(self, mock_dynamodb):
        event = self._make_event()
        with patch("validation.handle_validation.logger") as mock_logger:
            handle_validation.handler(event, self.mock_context)
            mock_logger.info.assert_any_call(
                f"Received event: {json.dumps(event)}"
            )

    def test_missing_fields_dont_crash(self):
        response = handle_validation.handler({}, self.mock_context)
        self.assertEqual(response["statusCode"], 400)

    @patch("validation.handle_validation.dynamodb")
    def test_missing_device_id_returns_400(self, mock_dynamodb):
        event = self._make_event()
        del event['device_id']
        response = handle_validation.handler(event, self.mock_context)
        self.assertEqual(response["statusCode"], 400)
        mock_dynamodb.Table.return_value.put_item.assert_not_called()

    @patch("validation.handle_validation.dynamodb")
    def test_missing_timestamp_returns_400(self, mock_dynamodb):
        event = self._make_event()
        del event['timestamp']
        response = handle_validation.handler(event, self.mock_context)
        self.assertEqual(response["statusCode"], 400)
        mock_dynamodb.Table.return_value.put_item.assert_not_called()

    @patch("validation.handle_validation.dynamodb")
    def test_high_temperature_alert_returns_200(self, mock_dynamodb):
        event = self._make_event()
        event['dht_temperature'] = 35.0
        response = handle_validation.handler(event, self.mock_context)
        self.assertEqual(response["statusCode"], 200)
        mock_dynamodb.Table.return_value.put_item.assert_called_once()

    @patch("validation.handle_validation.dynamodb")
    def test_flame_detected_alert_returns_200(self, mock_dynamodb):
        event = self._make_event()
        event['flame_analog'] = 150
        response = handle_validation.handler(event, self.mock_context)
        self.assertEqual(response["statusCode"], 200)
        mock_dynamodb.Table.return_value.put_item.assert_called_once()


if __name__ == "__main__":
    unittest.main()