"""Strict boundary helpers shared by prepared packages and the draft exchange."""

from datetime import datetime, timezone
import hashlib
import json
import math


class PlanningInputError(ValueError):
    def __init__(self, code, path, message):
        self.code, self.path = code, path
        super().__init__(message)

    def as_dict(self):
        return {"code": self.code, "path": self.path, "message": str(self)}


def text(value, path):
    if not isinstance(value, str) or not value.strip():
        raise PlanningInputError("invalid_text", path, "Expected nonempty text.")
    return value


def number(value, path, minimum=None, positive=False):
    try:
        valid = not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value)
        result = float(value) if valid else None
    except OverflowError:
        result = None
    if result is None:
        raise PlanningInputError("invalid_number", path, "Expected a finite number.")
    if (minimum is not None and result < minimum) or (positive and result <= 0):
        raise PlanningInputError("out_of_range", path, "Number is outside the allowed range.")
    return result


def integer(value, path, minimum=0):
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise PlanningInputError("invalid_integer", path, "Expected an integer in the allowed range.")
    return value


def fields(value, required, optional=(), path="request"):
    if not isinstance(value, dict):
        raise PlanningInputError("invalid_structure", path, "Expected an object.")
    for key in value:
        if key not in (*required, *optional):
            raise PlanningInputError("unknown_field", f"{path}.{key}", "Field is unsupported.")
    for key in required:
        if key not in value:
            raise PlanningInputError("missing_field", f"{path}.{key}", "Required field is absent.")
    return value


def utc(value, path):
    text(value, path)
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if result.tzinfo is None or result.utcoffset() != timezone.utc.utcoffset(result):
            raise ValueError
    except ValueError as exc:
        raise PlanningInputError("invalid_utc", path, "Expected an ISO-8601 UTC timestamp with Z or +00:00.") from exc
    return result


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def identity(value):
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


def loads_strict(value):
    def pairs(items):
        result = {}
        for key, item in items:
            if key in result:
                raise PlanningInputError("duplicate_field", key, "Duplicate JSON field.")
            result[key] = item
        return result

    def invalid(value):
        raise PlanningInputError("nonfinite_json", "json", "Nonfinite JSON constants are unsupported.")

    try:
        result = json.loads(value, parse_constant=invalid, object_pairs_hook=pairs)
        # Also rejects overflowing JSON exponents such as 1e999.
        canonical(result)
        return result
    except (ValueError, TypeError) as exc:
        if isinstance(exc, PlanningInputError):
            raise
        raise PlanningInputError("invalid_json", "json", "Expected finite JSON.") from exc
