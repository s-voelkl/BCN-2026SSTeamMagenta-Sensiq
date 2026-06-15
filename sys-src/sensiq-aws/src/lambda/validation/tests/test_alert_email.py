import unittest
from unittest.mock import MagicMock

from validation import alert_email


def _dummy_evaluate_rule(rule, value):
    """Lightweight stand-in for the production ``evaluate_rule``."""
    if value is None:
        return None
    if rule["type"] == "range":
        n = float(value)
        if n > rule["max"]:
            return rule["too_high_reason"]
        if n < rule["min"]:
            return rule["too_low_reason"]
    elif rule["type"] == "equals" and value != rule["expected"]:
        return rule["violation_reason"]
    return None


SAMPLE_RULES = [
    {
        "field": "dht_temperature", "label": "DHT temperature", "unit": "\u00b0C",
        "type": "range", "min": 10, "max": 30,
        "too_high_reason": "DHT temperature too high",
        "too_low_reason": "DHT temperature too low",
    },
    {
        "field": "dht_humidity", "label": "DHT humidity", "unit": "%",
        "type": "range", "min": 20, "max": 80,
        "too_high_reason": "Humidity too high",
        "too_low_reason": "Humidity too low",
    },
    {
        "field": "flame_digital", "label": "Flame sensor", "unit": "",
        "type": "equals", "expected": False,
        "violation_reason": "Flame detected",
    },
]


class TestFormatHelpers(unittest.TestCase):

    def test_format_value(self):
        self.assertEqual(alert_email._format_value({"unit": "\u00b0C"}, None), "n/a")
        self.assertEqual(alert_email._format_value({"unit": ""}, 42), "42")
        self.assertEqual(alert_email._format_value({"unit": "%"}, 51), "51%")
        self.assertEqual(
            alert_email._format_value({"unit": "\u00b0C"}, 25.1), "25.1 \u00b0C"
        )

    def test_format_constraint(self):
        self.assertEqual(
            alert_email._format_constraint(
                {"type": "range", "min": 10, "max": 30, "unit": "\u00b0C"}
            ),
            "expected between 10 \u00b0C and 30 \u00b0C",
        )
        self.assertEqual(
            alert_email._format_constraint(
                {"type": "range", "min": 20, "max": 80, "unit": "%"}
            ),
            "expected between 20% and 80%",
        )
        self.assertEqual(
            alert_email._format_constraint({"type": "equals", "expected": False}),
            "expected False",
        )
        self.assertEqual(alert_email._format_constraint({"type": "other"}), "")

    def test_format_timestamp(self):
        self.assertEqual(alert_email._format_timestamp(None), "unknown")
        self.assertEqual(
            alert_email._format_timestamp("2026-05-28T00:39:39Z"),
            "2026-05-28 00:39:39 UTC",
        )
        # 1700000000 -> 2023-11-14 22:13:20 UTC
        self.assertEqual(
            alert_email._format_timestamp(1700000000),
            "2023-11-14 22:13:20 UTC",
        )
        self.assertEqual(alert_email._format_timestamp("not-a-date"), "not-a-date")


class TestRenderAlertEmail(unittest.TestCase):

    def _make_event(self, overrides=None):
        base = {
            "timestamp": "2026-05-28T00:39:39Z",
            "device_id": "esp32-lab-001",
            "location": "Lab A, OTH Amberg-Weiden",
            "dht_humidity": 51,
            "dht_temperature": 25.1,
            "flame_digital": False,
        }
        return {**base, **(overrides or {})}

    def test_subject_and_body_for_breach(self):
        event = self._make_event({"dht_temperature": 31})
        reasons = ["DHT temperature too high"]

        subject, body = alert_email.render_alert_email(
            event, reasons, SAMPLE_RULES, _dummy_evaluate_rule
        )

        self.assertTrue(subject.startswith("Sensiq warning | "))
        self.assertIn("Lab A, OTH Amberg-Weiden", subject)
        self.assertIn("DHT temperature too high", subject)

        # Outlier marked, healthy values not marked, breach listed with constraint.
        self.assertIn("[!] DHT temperature: 31 \u00b0C", body)
        self.assertIn("    DHT humidity: 51%", body)
        self.assertIn(
            "- DHT temperature too high (measured 31 \u00b0C, "
            "expected between 10 \u00b0C and 30 \u00b0C)",
            body,
        )
        # Metadata is rendered.
        self.assertIn("esp32-lab-001", body)
        self.assertIn("2026-05-28 00:39:39 UTC", body)

    def test_subject_truncated_to_100_chars(self):
        event = self._make_event({"location": "X" * 200, "dht_temperature": 31})

        subject, _ = alert_email.render_alert_email(
            event, ["DHT temperature too high"], SAMPLE_RULES, _dummy_evaluate_rule
        )

        self.assertEqual(len(subject), 100)
        self.assertTrue(subject.endswith("..."))

    def test_no_reasons_and_missing_metadata(self):
        event = {"dht_temperature": 25.1}  # missing location, device_id, timestamp

        _, body = alert_email.render_alert_email(
            event, [], SAMPLE_RULES, _dummy_evaluate_rule
        )

        self.assertIn("(none)", body)
        self.assertIn("sensor anomaly", body)
        self.assertIn("unknown location", body)
        self.assertIn("unknown device", body)
        self.assertIn("DHT humidity: n/a", body)

    def test_evaluate_rule_called_once_per_rule(self):
        mock_evaluate = MagicMock(return_value=None)

        alert_email.render_alert_email(
            self._make_event(), [], SAMPLE_RULES, mock_evaluate
        )

        self.assertEqual(mock_evaluate.call_count, len(SAMPLE_RULES))


if __name__ == "__main__":
    unittest.main()
