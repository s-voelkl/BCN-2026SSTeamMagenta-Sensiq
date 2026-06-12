from datetime import datetime, timezone
from pathlib import Path


# Path to the plain-text email template used for SNS alert messages.
EMAIL_TEMPLATE_PATH = Path(__file__).with_name("alert_email_template.txt")

# SNS subjects are limited to 100 ASCII characters.
_MAX_SNS_SUBJECT_LENGTH = 100


def _format_value(rule: dict, value) -> str:
    """Render a measured value with its unit for display in the email body.
    
    Parameters:
        rule (dict): The validation rule dict that applies to this value, which may contain a "unit" key.
        value (str): The raw measured value to format, which may be None.
        
    Returns:
        str: A human-readable string representation of the value, including its unit if specified. 
            If the value is None, returns "n/a".
    """
    if value is None:
        return "n/a"
    
    unit = rule.get("unit") or ""
    if not unit:
        return str(value)
    
    # Percent stays attached to the number; other units get a space.
    separator = "" if unit == "%" else " "
    return f"{value}{separator}{unit}"


def _format_constraint(rule: dict) -> str:
    """Render the acceptable range or expected value of a rule as text.
    
    Parameters:
        rule (dict): The validation rule dict, which should contain a "type" key and 
            other keys depending on the type.
            
    Returns:
        str: A human-readable description of the rule's constraint, such as "expected between 
            0 and 100%" or "expected 25°C". If the rule type is unrecognized, returns an empty string.
    
    """
    if rule["type"] == "range":
        unit = rule.get("unit") or ""
        separator = "" if unit in ("", "%") else " "
        suffix = f"{separator}{unit}" if unit else ""
        return f"expected between {rule['min']}{suffix} and {rule['max']}{suffix}"
        
    if rule["type"] == "equals":
        return f"expected {rule['expected']}"
    
    return ""


def _format_timestamp(raw_timestamp) -> str:
    """Convert an ISO-8601 or epoch timestamp into a readable UTC string.
    
    Parameters:
        raw_timestamp (str|int|float|None): The original timestamp value from the 
            sensor data, which may be in ISO-8601 format, a Unix epoch (seconds since 1970-01-01), or None.
            
    Returns:
        str: A human-readable UTC timestamp string like "2026-05-28 00:39:39 UTC". 
            If the input is None, returns "unknown". If the input is an invalid timestamp, 
            returns the original value as a string.
    """
    if raw_timestamp is None:
        return "unknown"
    
    if isinstance(raw_timestamp, (int, float)):
        try:
            return datetime.fromtimestamp(
                float(raw_timestamp), tz=timezone.utc
            ).strftime("%Y-%m-%d %H:%M:%S UTC")
        except (OverflowError, OSError, ValueError):
            return str(raw_timestamp)
        
    try:
        parsed = datetime.fromisoformat(str(raw_timestamp).replace("Z", "+00:00"))
        return parsed.strftime("%Y-%m-%d %H:%M:%S UTC")
    except ValueError:
        return str(raw_timestamp)


def render_alert_email(
    sensor_data: dict,
    reasons: list[str],
    sensor_rules: list[dict],
    evaluate_rule,
) -> tuple[str, str]:
    """Render the subject and body of an alert email from ``sensor_data``.

    The plain-text body is produced from :data:`EMAIL_TEMPLATE_PATH`. Sensor
    fields that triggered a rule are flagged with ``[!]`` in the measured
    values section so the recipient can spot the outliers at a glance.

    ``evaluate_rule`` is injected so this module stays decoupled from the
    validation pipeline.
    
    Parameters:
        sensor_data (dict): The original sensor data dict that was validated, containing fields like 
            "location", "device_id", "timestamp", and various measured values.
        reasons (list[str]): A list of human-readable reasons why the alert was triggered, such as 
            "temperature above threshold". This will be summarized in the email subject and listed in the body.
        sensor_rules (list[dict]): The list of validation rules that were applied to the sensor data, 
            where each rule dict contains at least a "field" key indicating which sensor 
            field it applies to, and other keys depending on the rule type.
        evaluate_rule (callable): A function that takes a rule dict and a value, and returns a 
            reason string if the rule is breached or None otherwise.
    """
    location = sensor_data.get("location", "unknown location")
    device_id = sensor_data.get("device_id", "unknown device")
    human_timestamp = _format_timestamp(sensor_data.get("timestamp"))

    measured_lines: list[str] = []
    breach_lines: list[str] = []
    
    for rule in sensor_rules:
        value = sensor_data.get(rule["field"])
        reason = evaluate_rule(rule, value)
        marker = "[!]" if reason else "   "
        measured_lines.append(
            f"  {marker} {rule['label']}: {_format_value(rule, value)}"
        )

        if reason and reason in reasons:
            breach_lines.append(
                f"  - {reason} (measured {_format_value(rule, value)}, "
                f"{_format_constraint(rule)})"
            )

    measured_values = "\n".join(measured_lines)
    threshold_breaches = "\n".join(breach_lines) if breach_lines else "  (none)"
    reasons_summary = "; ".join(reasons) if reasons else "sensor anomaly"

    body = EMAIL_TEMPLATE_PATH.read_text(encoding="utf-8").format(
        reasons_summary=reasons_summary,
        location=location,
        device_id=device_id,
        human_timestamp=human_timestamp,
        measured_values=measured_values,
        threshold_breaches=threshold_breaches,
    )

    subject = f"Sensiq warning | {location} | {reasons_summary}"
    if len(subject) > _MAX_SNS_SUBJECT_LENGTH:
        subject = subject[: _MAX_SNS_SUBJECT_LENGTH - 3] + "..."

    return subject, body
