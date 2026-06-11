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
    def test_dynamo_error_returns_500(self, mock_dynamodb):
        mock_dynamodb.Table.return_value.put_item.side_effect = Exception("error")
        response = handle_validation.handler(self._make_event(), self.mock_context)
        self.assertEqual(response["statusCode"], 500)

    def test_get_alert_reasons_temperature_over_30(self):
        event = self._make_event({"dht_temperature": 31})

        reasons = handle_validation.get_alert_reasons(event)

        self.assertIn("DHT temperature too high", reasons)

    def test_get_alert_reasons_temperature_30_has_no_alert(self):
        event = self._make_event({"dht_temperature": 30})

        reasons = handle_validation.get_alert_reasons(event)

        self.assertNotIn("DHT temperature too high", reasons)

    def test_get_alert_reasons_thermistor_over_30(self):
        event = self._make_event({"thermistor_temp": 31})

        reasons = handle_validation.get_alert_reasons(event)

        self.assertIn("Thermistor temperature too high", reasons)

    def test_get_alert_reasons_humidity_over_80(self):
        event = self._make_event({"dht_humidity": 81})

        reasons = handle_validation.get_alert_reasons(event)

        self.assertIn("Humidity too high", reasons)

    def test_get_alert_reasons_flame_detected(self):
        event = self._make_event({"flame_digital": True})

        reasons = handle_validation.get_alert_reasons(event)

        self.assertIn("Flame detected", reasons)

    def test_get_alert_reasons_ignores_outlier(self):
        event = self._make_event({"is_outlier": True})

        reasons = handle_validation.get_alert_reasons(event)

        self.assertNotIn("Sensor outlier detected", reasons)

    def test_should_send_alert_without_existing_item(self):
        mock_table = MagicMock()
        mock_table.get_item.return_value = {}

        with patch.object(handle_validation, "sent_emails_table", mock_table):
            result = handle_validation.should_send_alert(
                "esp32-lab-001",
                "DHT temperature too high",
                1000,
            )

        self.assertTrue(result)

    def test_should_not_send_alert_during_cooldown(self):
        mock_table = MagicMock()
        mock_table.get_item.return_value = {
            "Item": {
                "device_id": "esp32-lab-001",
                "reason": "DHT temperature too high",
                "timestamp": 900,
            }
        }

        with patch.object(handle_validation, "sent_emails_table", mock_table):
            result = handle_validation.should_send_alert(
                "esp32-lab-001",
                "DHT temperature too high",
                1000,
            )

        self.assertFalse(result)

    def test_should_send_alert_after_cooldown(self):
        mock_table = MagicMock()
        mock_table.get_item.return_value = {
            "Item": {
                "device_id": "esp32-lab-001",
                "reason": "DHT temperature too high",
                "timestamp": 600,
            }
        }

        with patch.object(handle_validation, "sent_emails_table", mock_table):
            result = handle_validation.should_send_alert(
                "esp32-lab-001",
                "DHT temperature too high",
                1000,
            )

        self.assertTrue(result)

    def test_mark_alert_as_sent_writes_to_dynamodb(self):
        mock_table = MagicMock()

        with patch.object(handle_validation, "sent_emails_table", mock_table):
            handle_validation.mark_alert_as_sent(
                "esp32-lab-001",
                "DHT temperature too high",
                1000,
            )

        mock_table.put_item.assert_called_once_with(
            Item={
                "device_id": "esp32-lab-001",
                "reason": "DHT temperature too high",
                "timestamp": 1000,
            }
        )

    @patch("validation.handle_validation.dynamodb")
    def test_handler_publishes_alert_and_marks_as_sent(self, mock_dynamodb):
        event = self._make_event({"dht_temperature": 31})

        with patch.object(handle_validation, "should_send_alert", return_value=True), \
                patch.object(handle_validation, "publish_alert") as mock_publish_alert, \
                patch.object(handle_validation, "mark_alert_as_sent") as mock_mark_alert_as_sent:
            response = handle_validation.handler(event, {})

        mock_publish_alert.assert_called_once_with(
            event,
            ["DHT temperature too high"],
        )
        mock_mark_alert_as_sent.assert_called_once()
        mock_dynamodb.Table.return_value.put_item.assert_called_once()

        body = json.loads(response["body"])
        self.assertIn("DHT temperature too high", body["alert_reasons"])

    @patch("validation.handle_validation.dynamodb")
    def test_handler_does_not_publish_when_alert_is_in_cooldown(self, mock_dynamodb):
        event = self._make_event({"dht_temperature": 31})

        with patch.object(handle_validation, "should_send_alert", return_value=False), \
                patch.object(handle_validation, "publish_alert") as mock_publish_alert, \
                patch.object(handle_validation, "mark_alert_as_sent") as mock_mark_alert_as_sent:
            response = handle_validation.handler(event, {})

        mock_publish_alert.assert_not_called()
        mock_mark_alert_as_sent.assert_not_called()
        mock_dynamodb.Table.return_value.put_item.assert_called_once()

        body = json.loads(response["body"])
        self.assertIn("DHT temperature too high", body["alert_reasons"])

if __name__ == "__main__":
    unittest.main()
