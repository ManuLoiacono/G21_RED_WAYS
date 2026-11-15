"""Pure complete-sortie arithmetic over prepared movement and daylight evidence."""

from dataclasses import dataclass
from datetime import datetime, timezone
import math

from .routing import RoundTripRoutes, RouteLeg
from .team import EffectiveParticipant


# Absolute arithmetic tolerance only; never a physical or operational allowance.
TIME_ABS_TOL_S = 1e-6
MISSION_MODEL_VERSION = "complete-mission-v1"
NOT_EVALUATED = (
    "material", "communication", "effort", "physiology", "real_movement_validation",
    "weather_effects", "radiation", "terrain_shadow",
)
ASSUMPTIONS = (
    "Movement capabilities and durations use the supplied assumed movement model.",
    "Task durations, mission budget, reserve and participant availability are editable scenario assumptions.",
    "All selected participants, including robots, remain together during sequential tasks.",
    "Passing modeled rules does not establish operational safety.",
)


class MissionInputError(ValueError):
    """Malformed input is separate from a well-formed incompatible mission."""

    def __init__(self, code: str, path: str, message: str):
        self.code = code
        self.path = path
        super().__init__(message)


@dataclass(frozen=True)
class MissionTask:
    id: str
    duration_s: float


@dataclass(frozen=True)
class PhysicalTimeline:
    """An opaque declared scenario/sol epoch, never an inferred Mars clock."""

    epoch_id: str
    unit: str = "physical_second"
    convention: str = "elapsed_since_epoch"


@dataclass(frozen=True)
class Departure:
    timeline: PhysicalTimeline
    offset_s: float


@dataclass(frozen=True)
class DaylightWindow:
    timeline: PhysicalTimeline
    start_s: float
    end_s: float
    evaluation_location_id: str
    method: str
    evidence_id: str
    evidence_kind: str


@dataclass(frozen=True)
class SnapshotReference:
    """Prepared-input attestation, not a weather provider or shared wire schema.

    available_at_utc covers the exact supplied snapshot, including its daylight.
    The preparer must establish eligibility of every underlying record/revision.
    """

    scenario_id: str
    scenario_version: str
    snapshot_id: str
    as_of_utc: str
    available_at_utc: str
    availability_policy: str
    evaluation_location_id: str
    fixture: bool
    mode: str = "historical_replay"


@dataclass(frozen=True)
class AssessmentReason:
    code: str
    path: str
    message: str


@dataclass(frozen=True)
class MissionCheck:
    rule_id: str
    status: str  # passed, failed, missing_evidence or not_evaluated
    reason: AssessmentReason
    actual_s: float | None = None
    limit_s: float | None = None
    margin_s: float | None = None
    participant_id: str | None = None
    evidence_ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class ParticipantMargin:
    participant_id: str
    kind: str
    model_id: str
    max_sortie_s: float
    margin_s: float | None


@dataclass(frozen=True)
class MissionAssessment:
    # None when search is inconclusive without a decisive failure or missing evidence.
    assessment: str | None
    search_status: str
    outbound_s: float | None
    tasks_s: float
    return_s: float | None
    reserve_s: float
    elapsed_s: float | None
    reserved_total_s: float | None
    time_budget_s: float
    mission_margin_s: float | None
    participant_margins: tuple[ParticipantMargin, ...]
    limiting_margin_s: float | None
    limiting_constraints: tuple[str, ...]
    limiting_participant_ids: tuple[str, ...]
    departure: Departure
    daylight: DaylightWindow | None
    estimated_return_s: float | None
    reserved_deadline_s: float | None
    snapshot: SnapshotReference
    fixture: bool
    data_version: str
    movement_model_version: str
    checks: tuple[MissionCheck, ...]
    not_evaluated: tuple[str, ...]
    assumptions: tuple[str, ...] = ASSUMPTIONS
    model_version: str = MISSION_MODEL_VERSION
    time_abs_tolerance_s: float = TIME_ABS_TOL_S


def _text(value, path):
    if not isinstance(value, str) or not value.strip():
        raise MissionInputError("invalid_text", path, "Expected nonempty text.")
    return value


def _number(value, path, *, minimum=None, positive=False):
    try:
        valid = not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value)
        number = float(value) if valid else None
    except (OverflowError, ValueError):
        number = None
    if number is None:
        raise MissionInputError("invalid_number", path, "Expected a finite physical-second number.")
    if (minimum is not None and number < minimum) or (positive and number <= 0):
        raise MissionInputError("out_of_range", path, "Value is outside the allowed range.")
    return number


def _sum(values, path):
    try:
        result = math.fsum(values)
    except OverflowError as exc:
        raise MissionInputError("numeric_overflow", path, "Physical-second arithmetic overflowed.") from exc
    if not math.isfinite(result):
        raise MissionInputError("numeric_overflow", path, "Physical-second arithmetic overflowed.")
    return result


def _timeline(value, path):
    if not isinstance(value, PhysicalTimeline):
        raise MissionInputError("invalid_structure", path, "Expected a PhysicalTimeline.")
    _text(value.epoch_id, f"{path}.epoch_id")
    if value.unit != "physical_second":
        raise MissionInputError("unsupported_time_unit", f"{path}.unit", "Normalize to physical seconds first.")
    if value.convention != "elapsed_since_epoch":
        raise MissionInputError("unsupported_time_convention", f"{path}.convention", "Normalize relative to the declared epoch first.")


def _utc(value, path):
    _text(value, path)
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None or parsed.utcoffset() != timezone.utc.utcoffset(parsed):
            raise ValueError
    except ValueError as exc:
        raise MissionInputError("invalid_utc", path, "Expected an ISO-8601 UTC timestamp with Z or +00:00.") from exc
    return parsed


def _snapshot(value):
    if not isinstance(value, SnapshotReference):
        raise MissionInputError("invalid_structure", "snapshot", "Expected a prepared SnapshotReference.")
    for field in ("scenario_id", "scenario_version", "snapshot_id", "availability_policy", "evaluation_location_id"):
        _text(getattr(value, field), f"snapshot.{field}")
    if type(value.fixture) is not bool:
        raise MissionInputError("invalid_boolean", "snapshot.fixture", "Fixture must be explicitly true or false.")
    if value.mode != "historical_replay":
        raise MissionInputError("unsupported_mode", "snapshot.mode", "This slice accepts only an explicit historical replay.")
    cutoff = _utc(value.as_of_utc, "snapshot.as_of_utc")
    available = _utc(value.available_at_utc, "snapshot.available_at_utc")
    if available > cutoff:
        raise MissionInputError("snapshot_after_cutoff", "snapshot.available_at_utc", "Snapshot availability is later than the replay decision cutoff.")


def _leg(value, path):
    if not isinstance(value, RouteLeg):
        raise MissionInputError("invalid_structure", path, "Expected a movement RouteLeg.")
    if value.status == "found":
        return _number(value.duration_s, f"{path}.duration_s", minimum=0)
    if value.status not in ("no_path_in_domain", "search_inconclusive"):
        raise MissionInputError("invalid_leg_status", f"{path}.status", "Unknown or technical movement state.")
    if value.duration_s is not None:
        raise MissionInputError("unavailable_leg_duration", f"{path}.duration_s", "Unavailable legs must not invent durations.")
    if value.cells or value.xy_m or value.edge_results or any(
        item is not None for item in (value.search_cost_s, value.horizontal_distance_m, value.ascent_m, value.descent_m)
    ):
        raise MissionInputError("unavailable_leg_metrics", path, "Unavailable legs must not contain invented geometry or metrics.")
    return None


def evaluate_mission(
    routes: RoundTripRoutes,
    tasks: tuple[MissionTask, ...],
    participants: tuple[EffectiveParticipant, ...],
    *,
    time_budget_s: float,
    reserve_s: float,
    departure: Departure,
    daylight: DaylightWindow | None,
    snapshot: SnapshotReference,
) -> MissionAssessment:
    """Evaluate one fresh complete mission; never search, fetch, convert or mutate.

    Movement legs must already belong to these effective participants. No autonomy
    reset/remaining-mission API is implied. Missing daylight is required evidence.
    """
    if not isinstance(routes, RoundTripRoutes):
        raise MissionInputError("invalid_structure", "routes", "Expected RoundTripRoutes.")
    if type(routes.fixture) is not bool:
        raise MissionInputError("invalid_boolean", "routes.fixture", "Fixture must be explicitly true or false.")
    for field in ("data_version", "movement_model_version"):
        _text(getattr(routes, field), f"routes.{field}")
    if not isinstance(routes.not_evaluated, tuple) or any(not isinstance(item, str) or not item.strip() for item in routes.not_evaluated):
        raise MissionInputError("invalid_structure", "routes.not_evaluated", "Expected a tuple of unevaluated property names.")
    outbound_s = _leg(routes.outbound, "routes.outbound")
    return_s = _leg(routes.return_leg, "routes.return_leg")
    budget = _number(time_budget_s, "time_budget_s", positive=True)
    reserve = _number(reserve_s, "reserve_s", minimum=0)
    if not isinstance(tasks, (tuple, list)):
        raise MissionInputError("invalid_structure", "tasks", "Expected sequential tasks.")
    task_ids, durations = set(), []
    for index, task in enumerate(tasks):
        path = f"tasks[{index}]"
        if not isinstance(task, MissionTask):
            raise MissionInputError("invalid_structure", path, "Expected a MissionTask.")
        task_id = _text(task.id, f"{path}.id")
        if task_id in task_ids:
            raise MissionInputError("duplicate_task", f"{path}.id", "Task occurrence IDs must be unique.")
        task_ids.add(task_id)
        durations.append(_number(task.duration_s, f"{path}.duration_s", minimum=0))
    tasks_s = _sum(durations, "tasks_s")
    if not isinstance(participants, (tuple, list)) or not participants:
        raise MissionInputError("invalid_structure", "participants", "Supply the nonempty resolved movement team.")
    limits, participant_ids = [], set()
    for index, member in enumerate(participants):
        path = f"participants[{index}]"
        if not isinstance(member, EffectiveParticipant):
            raise MissionInputError("invalid_structure", path, "Expected an EffectiveParticipant from resolve_team.")
        participant_id = _text(member.identity.profile_id, f"{path}.profile_id")
        if participant_id in participant_ids:
            raise MissionInputError("duplicate_participant", f"{path}.profile_id", "Participant is selected more than once.")
        participant_ids.add(participant_id)
        _text(member.parameters.model_id, f"{path}.model_id")
        if member.kind not in ("human", "robot"):
            raise MissionInputError("invalid_participant_kind", f"{path}.kind", "Expected a resolved human or robot.")
        limits.append(_number(member.parameters.max_sortie_s, f"{path}.max_sortie_s", positive=True))
    _snapshot(snapshot)
    if not isinstance(departure, Departure):
        raise MissionInputError("invalid_structure", "departure", "Expected a normalized Departure.")
    _timeline(departure.timeline, "departure.timeline")
    departure_s = _number(departure.offset_s, "departure.offset_s")
    if daylight is not None:
        if not isinstance(daylight, DaylightWindow):
            raise MissionInputError("invalid_structure", "daylight", "Expected DaylightWindow or None for missing evidence.")
        _timeline(daylight.timeline, "daylight.timeline")
        if daylight.timeline != departure.timeline:
            raise MissionInputError("timeline_mismatch", "daylight.timeline.epoch_id", "Departure and daylight must use the same epoch.")
        start = _number(daylight.start_s, "daylight.start_s")
        end = _number(daylight.end_s, "daylight.end_s")
        if end <= start:
            raise MissionInputError("invalid_interval", "daylight.end_s", "Daylight end must be later than start on the normalized axis.")
        for field in ("evaluation_location_id", "method", "evidence_id"):
            _text(getattr(daylight, field), f"daylight.{field}")
        if daylight.evaluation_location_id != snapshot.evaluation_location_id:
            raise MissionInputError("location_mismatch", "daylight.evaluation_location_id", "Solar evidence must refer to the evaluated parcel location.")
        if daylight.evidence_kind not in ("assumed", "derived", "observed"):
            raise MissionInputError("invalid_evidence_kind", "daylight.evidence_kind", "Declare assumed, derived or observed daylight.")

    complete = outbound_s is not None and return_s is not None
    elapsed = _sum((outbound_s, tasks_s, return_s), "elapsed_s") if complete else None
    reserved = _sum((elapsed, reserve), "reserved_total_s") if complete else None
    estimated_return = _sum((departure_s, elapsed), "estimated_return_s") if complete else None
    deadline = _sum((departure_s, reserved), "reserved_deadline_s") if complete else None
    margin = _sum((budget, -reserved), "mission_margin_s") if complete else None
    margins = tuple(
        ParticipantMargin(member.identity.profile_id, member.kind, member.parameters.model_id, limit,
                          _sum((limit, -reserved), f"participants[{index}].margin_s") if complete else None)
        for index, (member, limit) in enumerate(zip(participants, limits))
    )
    checks = []
    for name, leg in (("outbound", routes.outbound), ("return", routes.return_leg)):
        status, code, message = {
            "found": ("passed", "route_found", "Directed movement leg was found in the supplied model/domain."),
            "no_path_in_domain": ("failed", "no_path_in_domain", "No directed movement leg exists in the evaluated model/domain."),
            "search_inconclusive": ("not_evaluated", "search_inconclusive", "Incomplete search does not establish impossibility."),
        }[leg.status]
        path = "routes.outbound" if name == "outbound" else "routes.return_leg"
        checks.append(MissionCheck(f"{name}_path", status, AssessmentReason(code, path, message)))

    def budget_check(rule_id, path, limit, value_margin, participant_id=None):
        if not complete:
            return MissionCheck(rule_id, "not_evaluated", AssessmentReason("movement_duration_unavailable", path, "Complete outbound and return durations are required."),
                                limit_s=limit, participant_id=participant_id)
        passed = value_margin >= -TIME_ABS_TOL_S
        return MissionCheck(rule_id, "passed" if passed else "failed",
                            AssessmentReason("within_time_limit" if passed else "time_limit_exceeded", path, "Complete elapsed time plus unused required reserve is checked against this limit."),
                            reserved, limit, value_margin, participant_id)

    checks.append(budget_check("mission_budget", "time_budget_s", budget, margin))
    checks.extend(budget_check("participant_time_limit", f"participants[{index}].max_sortie_s", item.max_sortie_s, item.margin_s, item.participant_id)
                  for index, item in enumerate(margins))
    if daylight is None:
        for rule_id in ("daylight_departure", "daylight_return_deadline"):
            checks.append(MissionCheck(rule_id, "missing_evidence", AssessmentReason("missing_daylight", "daylight", "Required normalized daylight evidence is absent.")))
    else:
        evidence = (daylight.evidence_id,)
        departure_margin = min(_sum((departure_s, -start), "daylight.departure_margin_s"),
                               _sum((end, -departure_s), "daylight.departure_margin_s"))
        passed = departure_margin >= -TIME_ABS_TOL_S
        checks.append(MissionCheck("daylight_departure", "passed" if passed else "failed",
                                  AssessmentReason("departure_in_daylight" if passed else "departure_outside_daylight", "departure.offset_s", "Departure must be inside the enabled daylight interval, including its boundaries."),
                                  actual_s=departure_s, margin_s=departure_margin, evidence_ids=evidence))
        if not complete:
            checks.append(MissionCheck("daylight_return_deadline", "not_evaluated", AssessmentReason("movement_duration_unavailable", "daylight.end_s", "Reserved deadline requires complete movement durations."), limit_s=end, evidence_ids=evidence))
        else:
            daylight_margin = _sum((end, -deadline), "daylight.return_margin_s")
            passed = daylight_margin >= -TIME_ABS_TOL_S
            checks.append(MissionCheck("daylight_return_deadline", "passed" if passed else "failed",
                                      AssessmentReason("reserved_return_in_daylight" if passed else "reserved_return_after_daylight", "daylight.end_s", "Estimated return plus unused required reserve must be no later than daylight end."),
                                      deadline, end, daylight_margin, evidence_ids=evidence))
    search_status = "search_inconclusive" if any(leg.status == "search_inconclusive" for leg in (routes.outbound, routes.return_leg)) else "complete"
    if any(check.status == "failed" for check in checks):
        assessment = "incompatible"
    elif any(check.status == "missing_evidence" for check in checks):
        assessment = "insufficient_evidence"
    elif search_status == "search_inconclusive":
        assessment = None
    else:
        assessment = "viable_model"
    limiting_margin = min((margin, *(item.margin_s for item in margins))) if complete else None
    # Ties use exact raw margins; tolerance affects pass/fail, not the reported numbers.
    limiting_constraints = (("time_budget_s",) if complete and margin == limiting_margin else ()) + tuple(
        f"participants[{index}].max_sortie_s" for index, item in enumerate(margins) if complete and item.margin_s == limiting_margin
    )
    limiting_ids = tuple(item.participant_id for item in margins if complete and item.margin_s == limiting_margin)
    evaluated = {"mission_budget", "daylight"} if complete and daylight is not None else ({"mission_budget"} if complete else set())
    not_evaluated = tuple(dict.fromkeys((*NOT_EVALUATED, *(item for item in routes.not_evaluated if item not in evaluated))))
    return MissionAssessment(
        assessment=assessment, search_status=search_status,
        outbound_s=outbound_s, tasks_s=tasks_s, return_s=return_s, reserve_s=reserve,
        elapsed_s=elapsed, reserved_total_s=reserved, time_budget_s=budget, mission_margin_s=margin,
        participant_margins=margins, limiting_margin_s=limiting_margin,
        limiting_constraints=limiting_constraints, limiting_participant_ids=limiting_ids,
        departure=departure, daylight=daylight, estimated_return_s=estimated_return,
        reserved_deadline_s=deadline, snapshot=snapshot,
        fixture=routes.fixture or snapshot.fixture or (daylight is not None and daylight.evidence_kind == "assumed"),
        data_version=routes.data_version, movement_model_version=routes.movement_model_version,
        checks=tuple(checks), not_evaluated=not_evaluated,
    )
