"""Explicit unaccepted draft exchange; no legacy interpretation or response fallback."""

from collections import Counter
from dataclasses import asdict, dataclass
import json

from engine import (
    CATALOG, MISSION_TEMPLATES, TEMPLATE_VERSION, GridInputError, MissionInputError,
    MissionTask, SelectionError, export_mission_templates, resolve_team,
)
from .validation import PlanningInputError, canonical, fields, integer, loads_strict, number, text, utc


DRAFT_SCHEMA_VERSION = "p2-plan-draft-1"


@dataclass(frozen=True)
class DraftRequest:
    """Validated immutable wire input; raw override/payload provenance is retained."""

    canonical_json: str
    tasks: tuple[MissionTask, ...]


def decode_request(value):
    if not isinstance(value, dict):
        raise PlanningInputError("invalid_structure", "request", "Expected a draft request object.")
    if "schema_version" not in value:
        raise PlanningInputError("missing_field", "schema_version", "An explicit draft version is required.")
    if value["schema_version"] != DRAFT_SCHEMA_VERSION:
        raise PlanningInputError("unsupported_schema_version", "schema_version", "Only p2-plan-draft-1 is supported; v0 is not silently adapted.")
    fields(value, ("schema_version", "request_id", "revision", "parcel", "scenario", "origin", "destination", "team", "mission", "criterion"))
    text(value["request_id"], "request_id")
    integer(value["revision"], "revision")
    if value["criterion"] != "fastest":
        raise PlanningInputError("unsupported_criterion", "criterion", "Only a static time-optimized candidate is computed.")
    fields(value["parcel"], ("id", "version"), path="parcel")
    fields(value["scenario"], ("id", "version", "as_of_utc"), path="scenario")
    for group in ("parcel", "scenario"):
        for key in ("id", "version"):
            text(value[group][key], f"{group}.{key}")
    utc(value["scenario"]["as_of_utc"], "scenario.as_of_utc")
    mission = fields(value["mission"], ("template_id", "template_version", "tasks", "time_budget_s", "reserve_s", "departure_utc"), path="mission")
    if mission["template_version"] != TEMPLATE_VERSION:
        raise PlanningInputError("template_version_mismatch", "mission.template_version", "Requested template version is unavailable.")
    if mission["template_id"] not in tuple(item.id for item in MISSION_TEMPLATES):
        raise PlanningInputError("unknown_template", "mission.template_id", "Template ID is not in the central definitions.")
    number(mission["time_budget_s"], "mission.time_budget_s", positive=True)
    number(mission["reserve_s"], "mission.reserve_s", minimum=0)
    utc(mission["departure_utc"], "mission.departure_utc")
    if not isinstance(mission["tasks"], list):
        raise PlanningInputError("invalid_structure", "mission.tasks", "Expected sequential task occurrences.")
    tasks, ids = [], set()
    for index, raw in enumerate(mission["tasks"]):
        path = f"mission.tasks[{index}]"
        fields(raw, ("id", "duration_s"), path=path)
        task_id = text(raw["id"], f"{path}.id")
        if task_id in ids:
            raise PlanningInputError("duplicate_task", f"{path}.id", "Task occurrence IDs must be unique.")
        ids.add(task_id)
        tasks.append(MissionTask(task_id, number(raw["duration_s"], f"{path}.duration_s", minimum=0)))
    try:
        resolve_team(CATALOG, value["team"])
    except SelectionError as exc:
        raise PlanningInputError(exc.code, exc.path, str(exc)) from exc
    # Registry-dependent location checks happen before any graph build in plan().
    for name in ("origin", "destination"):
        location = value[name]
        if not isinstance(location, dict):
            raise PlanningInputError("invalid_structure", name, "Expected a tagged location object.")
        if location.get("type") == "poi":
            fields(location, ("type", "poi_id"), path=name)
            text(location["poi_id"], f"{name}.poi_id")
        elif location.get("type") == "coordinate":
            fields(location, ("type", "frame", "xy_m"), path=name)
            if location["frame"] != "parcel_metric":
                raise PlanningInputError("unsupported_coordinate_adapter", f"{name}.frame", "Geographic/real conversion is unavailable.")
            if not isinstance(location["xy_m"], list) or len(location["xy_m"]) != 2:
                raise PlanningInputError("invalid_structure", f"{name}.xy_m", "Expected an x/y pair.")
            for index, item in enumerate(location["xy_m"]):
                number(item, f"{name}.xy_m[{index}]")
        else:
            raise PlanningInputError("unsupported_location_type", f"{name}.type", "Choose poi or coordinate.")
    return DraftRequest(canonical(value), tuple(tasks))


def _leg(leg):
    return {key: getattr(leg, key) for key in ("status", "reason", "cells", "xy_m", "duration_s", "search_cost_s",
                                             "horizontal_distance_m", "ascent_m", "descent_m")}


def encode_response(request: DraftRequest, result):
    echo = loads_strict(request.canonical_json)
    mission = result.mission
    selected = result.selected_scenario
    solar = {check.rule_id: check for check in mission.checks if check.rule_id.startswith("daylight_")}
    metrics = {
        "outbound_s": mission.outbound_s, "tasks_s": mission.tasks_s, "return_s": mission.return_s,
        "elapsed_s": mission.elapsed_s, "reserve_s": mission.reserve_s, "reserved_total_s": mission.reserved_total_s,
        "time_budget_s": mission.time_budget_s, "mission_margin_s": mission.mission_margin_s,
        "participant_margins": [asdict(item) for item in mission.participant_margins],
        "temporal_budget_limiting_margin_s": mission.limiting_margin_s,
        "temporal_budget_limiting_constraints": mission.limiting_constraints,
        "temporal_budget_limiting_participant_ids": mission.limiting_participant_ids,
        "daylight_departure_margin_s": solar["daylight_departure"].margin_s,
        "daylight_reserved_return_margin_s": solar["daylight_return_deadline"].margin_s,
        "estimated_return_offset_s": mission.estimated_return_s, "reserved_deadline_offset_s": mission.reserved_deadline_s,
        "unavailable_totals_reason": "movement_duration_unavailable" if mission.elapsed_s is None else None,
    }
    response = {
        "schema_version": DRAFT_SCHEMA_VERSION, "contract_status": "consumer_review_pending",
        "request_echo": echo, "assessment": mission.assessment, "search_status": mission.search_status,
        "status": mission.assessment or mission.search_status,
        "calculation_origin": "engine",
        "input_provenance": {"fixture": result.parcel.grid.fixture or selected.snapshot.fixture,
                             "terrain_fixture": result.parcel.grid.fixture, "scenario_fixture": selected.snapshot.fixture,
                             "movement_parameters_evidence": "assumed", "geographic_conversion": result.origin.geographic_conversion},
        "geographic_adapter": result.parcel.geographic_adapter,
        "locations": {"origin": asdict(result.origin), "destination": asdict(result.destination)},
        "resolved_team": [asdict(item) for item in result.participants],
        "movement_context": {"id": result.context.id, "applied_movement_effects": result.context.applied_movement_effects},
        "versions": {"parcel": result.parcel.version, "parcel_content_id": result.parcel.content_id,
                     "data": result.parcel.grid.data_version, "masks": result.parcel.mask_version, "slope": result.parcel.slope_version,
                     "catalog": CATALOG.version, "templates": TEMPLATE_VERSION, "movement": result.context.movement_model_version,
                     "backend": result.context.backend_version, "mission": mission.model_version,
                     "scenario": selected.snapshot.scenario_version},
        "environment": {"snapshot": asdict(selected.snapshot), "clock_mapping": asdict(selected.clock),
                        "departure": asdict(selected.departure), "daylight": asdict(selected.daylight) if selected.daylight else None,
                        "decision_records": [asdict(item) for item in selected.decision_records],
                        "selection_rule": selected.selection_rule,
                        "excluded_record_counts": dict(sorted(Counter(item.code for item in selected.exclusions).items())),
                        "missing_required": selected.missing_required, "missing_optional_variables": selected.missing_optional_variables,
                        "missing_forecast_variables": selected.missing_forecast_variables,
                        "provider_metadata": selected.provider_metadata,
                        "mission_target_interval": selected.mission_target_interval,
                        "forecast_applicability_rule": "Full departure-through-reserved-return containment in the target sol; distinct leads and targets remain separate.",
                        "effects": "Weather and RAD are context only; only geometric daylight changes environmental mission assessment."},
        "alternatives": [{"id": "fastest", "criterion": "fastest", "assessment": mission.assessment,
                          "search_status": mission.search_status, "coordinate_frame": "parcel_metric",
                          "outbound": _leg(result.routes.outbound), "return": _leg(result.routes.return_leg),
                          "metrics": metrics, "checks": [asdict(check) for check in mission.checks]}],
        "not_evaluated": mission.not_evaluated,
        "assumptions": (*mission.assumptions, *selected.assumptions),
        "time_abs_tolerance_s": mission.time_abs_tolerance_s,
        "movement_reuse": {"graph": result.graph_reused, "base_search": result.search_reused},
    }
    # Normalize tuples and verify all nested fields are finite JSON before publication.
    return json.loads(canonical(response))


def plan_draft(planner, payload):
    request = decode_request(payload)
    value = loads_strict(request.canonical_json)
    mission = value["mission"]
    try:
        result = planner.plan(parcel_id=value["parcel"]["id"], parcel_version=value["parcel"]["version"],
                              scenario_id=value["scenario"]["id"], scenario_version=value["scenario"]["version"],
                              origin=value["origin"], destination=value["destination"], team=value["team"], tasks=request.tasks,
                              time_budget_s=mission["time_budget_s"], reserve_s=mission["reserve_s"],
                              departure_utc=mission["departure_utc"], as_of_utc=value["scenario"]["as_of_utc"])
    except (SelectionError, MissionInputError, GridInputError) as exc:
        raise PlanningInputError(exc.code, exc.path, str(exc)) from exc
    # Backend/reconstruction/busy errors propagate; they never become a fallback plan.
    return encode_response(request, result)


def export_catalogs():
    return {"catalog": {**asdict(CATALOG), "fixture": True, "evidence_kind": "assumed"},
            "mission_templates": export_mission_templates()}
