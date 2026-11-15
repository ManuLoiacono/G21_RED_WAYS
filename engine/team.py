"""Validate mission loads and overrides without modifying catalog entries."""

from dataclasses import dataclass, replace
import math
from typing import Mapping

from .catalog import Catalog, Identity, OperationalDefaults, SelectionError, select_team


OVERRIDABLE_PARAMETERS = frozenset({
    "flat_speed_m_s", "max_ascent_deg", "max_descent_deg", "carrying_limit_kg", "max_sortie_s"
})


@dataclass(frozen=True)
class EffectiveParticipant:
    kind: str
    identity: Identity
    parameters: OperationalDefaults
    payload_kg: float


def _mapping(value: object, path: str) -> Mapping:
    if not isinstance(value, Mapping):
        raise SelectionError("invalid_structure", path, "Expected an object.")
    return value


def _number(value: object, path: str, *, positive: bool = False) -> float:
    try:
        valid = not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value)
    except OverflowError:
        valid = False
    if not valid:
        raise SelectionError("invalid_number", path, "Expected a finite number.")
    if (positive and value <= 0) or (not positive and value < 0):
        raise SelectionError("out_of_range", path, "Value is outside the allowed range.")
    return float(value)


def _known_fields(value: Mapping, allowed: frozenset[str], path: str) -> None:
    for key in value:
        if key not in allowed:
            raise SelectionError("unknown_field", f"{path}.{key}", "Field is not supported.")


def resolve_team(catalog: Catalog, request: Mapping) -> tuple[EffectiveParticipant, ...]:
    """Resolve the proposed v1 `team` object into independent effective parameters."""
    team = _mapping(request, "team")
    _known_fields(team, frozenset({"catalog_version", "humans", "robots"}), "team")
    humans = team.get("humans")
    robots = team.get("robots")
    if not isinstance(humans, (tuple, list)) or not isinstance(robots, (tuple, list)):
        raise SelectionError("invalid_structure", "team.humans" if not isinstance(humans, (tuple, list)) else "team.robots", "Expected participant arrays.")
    records = []
    for kind, group in (("human", humans), ("robot", robots)):
        for index, value in enumerate(group):
            path = f"team.{kind}s[{index}]"
            record = _mapping(value, path)
            _known_fields(record, frozenset({"profile_id", "payload_kg", "mission_overrides"}), path)
            if "profile_id" not in record:
                raise SelectionError("missing_field", f"{path}.profile_id", "Profile ID is required.")
            if "payload_kg" not in record:
                raise SelectionError("missing_field", f"{path}.payload_kg", "Assigned payload is required.")
            records.append((kind, index, record))
    selected = select_team(
        catalog, team.get("catalog_version"),
        tuple(record["profile_id"] for kind, _, record in records if kind == "human"),
        tuple(record["profile_id"] for kind, _, record in records if kind == "robot"),
    )
    effective = []
    for entry, (kind, index, record) in zip(selected, records):
        path = f"team.{kind}s[{index}]"
        payload = _number(record["payload_kg"], f"{path}.payload_kg")
        overrides = _mapping(record.get("mission_overrides", {}), f"{path}.mission_overrides")
        parameters = entry.defaults
        for key, value in overrides.items():
            field = f"{path}.mission_overrides.{key}"
            if key not in OVERRIDABLE_PARAMETERS:
                raise SelectionError("invalid_override", field, "This parameter cannot be overridden.")
            number = _number(value, field, positive=key in {"flat_speed_m_s", "max_sortie_s"})
            if key in {"max_ascent_deg", "max_descent_deg"} and number >= 90:
                raise SelectionError("out_of_range", field, "Grade limit must be below 90 degrees.")
            parameters = replace(parameters, **{key: number})
        if payload > parameters.carrying_limit_kg:
            raise SelectionError("payload_exceeds_limit", f"{path}.payload_kg", "Assigned payload exceeds this participant's carrying limit.")
        effective.append(EffectiveParticipant(entry.kind, entry.identity, parameters, payload))
    return tuple(effective)


def resolve_comparison(catalog: Catalog, original: tuple[EffectiveParticipant, ...], proposal: Mapping) -> tuple[EffectiveParticipant, ...]:
    """Require explicit reassignment of every kilogram in a team comparison."""
    effective = resolve_team(catalog, proposal)
    original_total = sum(member.payload_kg for member in original)
    proposed_total = sum(member.payload_kg for member in effective)
    if not math.isclose(original_total, proposed_total, rel_tol=0, abs_tol=1e-9):
        raise SelectionError("payload_not_preserved", "team", "Proposed team must explicitly reassign the required total payload.")
    return effective
