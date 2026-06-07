import unittest
from unittest.mock import patch, MagicMock
import validation.handle_validation as handle_validation


class TestHandleValidation(unittest.TestCase):

    def setUp(self):
        self.mock_context = MagicMock()
        self.valid_event = {
            "device_id": "esp32-lab-001",
            "timestamp": "2026-05-28T00:39:39Z",
            "dht_temperature": 25.0,
            "dht_humidity": 50.0,
            "flame_analog": 900,
            "thermistor_temp": 24.0
        }

    @patch("validation.handle_validation.dynamodb")
    def test_normal_data_returns_200(self, mock_dynamodb):
        mock_dynamodb.Table.return_value = MagicMock()
        result = handle_validation.handler(self.valid_event, self.mock_context)
        self.assertEqual(result["statusCode"], 200)

    def test_no_device_id_returns_400(self):
        event = dict(self.valid_event)
        del event["device_id"]
        result = handle_validation.handler(event, self.mock_context)
        self.assertEqual(result["statusCode"], 400)

    def test_no_timestamp_returns_400(self):
        event = dict(self.valid_event)
        del event["timestamp"]
        result = handle_validation.handler(event, self.mock_context)
        self.assertEqual(result["statusCode"], 400)

    @patch("validation.handle_validation.dynamodb")
    def test_high_temperature_still_saves(self, mock_dynamodb):
        mock_dynamodb.Table.return_value = MagicMock()
        event = dict(self.valid_event)
        event["dht_temperature"] = 35.0
        result = handle_validation.handler(event, self.mock_context)
        self.assertEqual(result["statusCode"], 200)

    @patch("validation.handle_validation.dynamodb")
    def test_dynamo_error_returns_500(self, mock_dynamodb):
        mock_dynamodb.Table.return_value.put_item.side_effect = Exception("error")
        result = handle_validation.handler(self.valid_event, self.mock_context)
        self.assertEqual(result["statusCode"], 500)


if __name__ == "__main__":
    unittest.main()