import math
import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from .errors import bad_request

EMAIL = re.compile(r"[^\s@]+@[^\s@]+\.[^\s@]+")
PHONE = re.compile(r"[0-9+\-\s()]{7,20}")
GSTIN = re.compile(r"[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]")


def string(label, max=None, min=None, required=False):
    return {"type": "string", "label": label, "max": max, "min": min, "required": required}


def email(label="Email", max=160, required=False):
    return {"type": "email", "label": label, "max": max, "required": required}


def phone(label="Contact number"):
    return {"type": "phone", "label": label}


def gstin(label="GSTIN"):
    return {"type": "gstin", "label": label}


def integer(label, min=None, max=None, required=False):
    return {"type": "int", "label": label, "min": min, "max": max, "required": required}


def decimal(label, min=None, max=None, required=False):
    return {"type": "decimal", "label": label, "min": min, "max": max, "required": required}


def boolean(label=None):
    return {"type": "bool", "label": label}


def date(label, required=False):
    return {"type": "date", "label": label, "required": required}


def enum(label, values, required=False):
    return {"type": "enum", "label": label, "values": values, "required": required}


def _number(value):
    if isinstance(value, bool):
        return Decimal(int(value))
    try:
        number = Decimal(str(value).strip())
    except InvalidOperation:
        return None
    return number if number.is_finite() else None


def _bounds(number, rule):
    if rule.get("min") is not None and number < Decimal(str(rule["min"])):
        raise ValueError(f"must be at least {rule['min']}")
    if rule.get("max") is not None and number > Decimal(str(rule["max"])):
        raise ValueError(f"must be at most {rule['max']}")


def parse_date(value):
    if not isinstance(value, str):
        raise ValueError("must be a valid date")
    text = value.strip()
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        raise ValueError("must be a valid date") from None
    if parsed.tzinfo:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def _coerce(value, rule):
    kind = rule["type"]
    if kind == "int":
        number = _number(value)
        if number is None or number != number.to_integral_value():
            raise ValueError("must be a whole number")
        _bounds(number, rule)
        return int(number)
    if kind == "decimal":
        number = _number(value)
        if number is None:
            raise ValueError("must be a number")
        _bounds(number, rule)
        return number
    if kind == "bool":
        return value is True or value == "true" or value == 1 or value == "1"
    if kind == "date":
        return parse_date(value)
    if kind == "enum":
        text = str(value).upper()
        if text not in rule["values"]:
            raise ValueError(f"must be one of {', '.join(rule['values'])}")
        return text

    text = str(value).lower() if isinstance(value, bool) else str(value)
    text = text.strip().replace("\x00", "")
    if rule.get("max") and len(text) > rule["max"]:
        raise ValueError(f"must be at most {rule['max']} characters")
    if rule.get("min") and len(text) < rule["min"]:
        raise ValueError(f"must be at least {rule['min']} characters")
    if kind == "email" and not EMAIL.fullmatch(text):
        raise ValueError("must be a valid email address")
    if kind == "phone" and not PHONE.fullmatch(text):
        raise ValueError("must be a valid phone number")
    if kind == "gstin":
        upper = text.upper()
        if not GSTIN.fullmatch(upper):
            raise ValueError("must be a valid 15-character GSTIN")
        return upper
    return text


def clean(body, spec, partial=False):
    """Returns only the fields named in spec, so unknown body keys never reach the database."""
    body = body if isinstance(body, dict) else {}
    data = {}
    errors = {}
    for key, rule in spec.items():
        present = key in body
        raw = body.get(key)
        if not present or raw is None or raw == "":
            if not present and partial:
                continue
            if rule.get("required"):
                errors[key] = f"{rule.get('label') or key} is required"
                continue
            if present:
                data[key] = False if rule["type"] == "bool" else None
            continue
        try:
            data[key] = _coerce(raw, rule)
        except ValueError as error:
            errors[key] = f"{rule.get('label') or key} {error}"
    if errors:
        raise bad_request(next(iter(errors.values())), errors)
    return data


def int_param(value, name="ID"):
    number = _number(value)
    if number is None or number != number.to_integral_value() or number <= 0 or number > 2147483647:
        raise bad_request(f"Invalid {name}")
    return int(number)


def query_int(value):
    """Filter values from the URL. A value that is not a number matches nothing."""
    number = _number(value)
    if number is None or number != number.to_integral_value() or math.fabs(number) > 2147483647:
        raise bad_request("Invalid filter value")
    return int(number)
