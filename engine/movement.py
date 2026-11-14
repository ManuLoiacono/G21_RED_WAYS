"""Pure directed-edge movement evaluation for a selected, co-traveling team."""

from dataclasses import dataclass
import math
from numbers import Real
from typing import Protocol

from .team import EffectiveParticipant


@dataclass(frozen=True)
class CellTerrain:
    terrain_code: str | None
    elevation_m: float | None
    excluded: bool = False
    coverage_valid: bool = True
    terrain_slope_deg: float | None = None


@dataclass(frozen=True)
class DirectedMetricEdge:
    source: CellTerrain
    target: CellTerrain
    run_m: float
    rise_m: float

    def reversed(self) -> "DirectedMetricEdge":
        return DirectedMetricEdge(self.target, self.source, self.run_m, -self.rise_m)


@dataclass(frozen=True)
class EdgeReason:
    code: str
    path: str
    message: str
    participant_id: str | None = None


@dataclass(frozen=True)
class ParticipantEdgeResult:
    participant_id: str
    allowed: bool
    duration_s: float | None
    reasons: tuple[EdgeReason, ...]
    evidence_ids: tuple[str, ...]


@dataclass(frozen=True)
class GroupEdgeResult:
    allowed: bool
    duration_s: float | None
    participant_results: tuple[ParticipantEdgeResult, ...]
    limiting_participant_ids: tuple[str, ...]
    reasons: tuple[EdgeReason, ...]


class MovementStrategy(Protocol):
    evidence_id: str

    def speed_m_s(self, participant: EffectiveParticipant, signed_grade_deg: float) -> float: ...


class SyntheticHumanModel:
    """Scenario assumption: uphill slows 3%/degree; downhill 1%/degree."""

    evidence_id = "synthetic_human_directional_speed_v1"

    def speed_m_s(self, participant: EffectiveParticipant, signed_grade_deg: float) -> float:
        factor = 0.03 if signed_grade_deg >= 0 else 0.01
        return participant.parameters.flat_speed_m_s / (1 + factor * abs(signed_grade_deg))


class SyntheticRobotModel:
    """Scenario assumption: uphill slows 2%/degree; downhill 4%/degree."""

    evidence_id = "synthetic_robot_directional_speed_v1"

    def speed_m_s(self, participant: EffectiveParticipant, signed_grade_deg: float) -> float:
        factor = 0.02 if signed_grade_deg >= 0 else 0.04
        return participant.parameters.flat_speed_m_s / (1 + factor * abs(signed_grade_deg))


def _finite_number(value: object) -> bool:
    try:
        return not isinstance(value, bool) and isinstance(value, Real) and math.isfinite(value)
    except OverflowError:
        return False


# Numerical comparison tolerance only; this does not describe terrain accuracy.
RISE_ABS_TOL_M = 1e-6


def _edge_reasons(edge: DirectedMetricEdge) -> tuple[EdgeReason, ...]:
    reasons = []
    if not _finite_number(edge.run_m) or edge.run_m <= 0:
        reasons.append(EdgeReason("invalid_run", "edge.run_m", "Horizontal run must be finite and positive."))
    if not _finite_number(edge.rise_m):
        reasons.append(EdgeReason("invalid_rise", "edge.rise_m", "Directed rise must be finite."))
    for name, cell in (("source", edge.source), ("target", edge.target)):
        if cell.elevation_m is None:
            reasons.append(EdgeReason("missing_elevation", f"edge.{name}.elevation_m", "Essential elevation is missing."))
        elif not _finite_number(cell.elevation_m):
            reasons.append(EdgeReason("invalid_elevation", f"edge.{name}.elevation_m", "Elevation must be finite."))
        if cell.terrain_code is not None and (not isinstance(cell.terrain_code, str) or not cell.terrain_code.strip()):
            reasons.append(EdgeReason("invalid_material", f"edge.{name}.terrain_code", "Optional material classification must be nonempty text."))
        if not isinstance(cell.coverage_valid, bool):
            reasons.append(EdgeReason("invalid_coverage", f"edge.{name}.coverage_valid", "Coverage must be a boolean."))
        if not cell.coverage_valid:
            reasons.append(EdgeReason("missing_coverage", f"edge.{name}.coverage_valid", "Essential analytical coverage is missing."))
        if cell.terrain_slope_deg is not None and (not _finite_number(cell.terrain_slope_deg) or not 0 <= cell.terrain_slope_deg < 90):
            reasons.append(EdgeReason("invalid_terrain_slope", f"edge.{name}.terrain_slope_deg", "Terrain slope summary must be finite and in [0, 90) degrees."))
        if not isinstance(cell.excluded, bool):
            reasons.append(EdgeReason("invalid_exclusion", f"edge.{name}.excluded", "Exclusion must be a boolean."))
        if cell.excluded:
            reasons.append(EdgeReason("excluded_cell", f"edge.{name}.excluded", "Cell is excluded from traversal."))
    if all(_finite_number(value) for value in (edge.source.elevation_m, edge.target.elevation_m, edge.rise_m)):
        derived_rise = float(edge.target.elevation_m) - float(edge.source.elevation_m)
        if not math.isfinite(derived_rise):
            reasons.append(EdgeReason("invalid_geometry", "edge", "Elevation difference must be finite."))
        elif not math.isclose(float(edge.rise_m), derived_rise, rel_tol=0, abs_tol=RISE_ABS_TOL_M):
            reasons.append(EdgeReason("inconsistent_rise", "edge.rise_m", "Rise must equal target minus source elevation."))
    return tuple(reasons)


def evaluate_edge(
    team: tuple[EffectiveParticipant, ...], edge: DirectedMetricEdge,
    human_model: MovementStrategy | None = None, robot_model: MovementStrategy | None = None,
) -> GroupEdgeResult:
    """Intersect permissions and take the slowest participant's time on this edge."""
    if not team:
        reason = EdgeReason("empty_team", "team", "At least one participant is required.")
        return GroupEdgeResult(False, None, (), (), (reason,))
    human_model = human_model or SyntheticHumanModel()
    robot_model = robot_model or SyntheticRobotModel()
    shared = _edge_reasons(edge)
    grade = math.degrees(math.atan2(float(edge.target.elevation_m) - float(edge.source.elevation_m), edge.run_m)) if not shared else None
    results = []
    for participant in team:
        profile_id = participant.identity.profile_id
        model = human_model if participant.kind == "human" else robot_model
        reasons = list(shared)
        if grade is not None:
            for name, cell in (("source", edge.source), ("target", edge.target)):
                if cell.terrain_slope_deg is not None and cell.terrain_slope_deg > min(participant.parameters.max_ascent_deg, participant.parameters.max_descent_deg):
                    reasons.append(EdgeReason("terrain_slope_limit", f"edge.{name}.terrain_slope_deg", "Conservative terrain slope exceeds the participant limit.", profile_id))
            if grade > participant.parameters.max_ascent_deg:
                reasons.append(EdgeReason("ascent_limit", "edge.rise_m", "Directed ascent exceeds the participant limit.", profile_id))
            if -grade > participant.parameters.max_descent_deg:
                reasons.append(EdgeReason("descent_limit", "edge.rise_m", "Directed descent exceeds the participant limit.", profile_id))
        duration = None
        if not reasons:
            speed = model.speed_m_s(participant, grade)
            if not _finite_number(speed) or speed <= 0:
                reasons.append(EdgeReason("invalid_model_speed", "movement_model", "Movement model returned an invalid speed.", profile_id))
            else:
                duration = edge.run_m / speed
                if not math.isfinite(duration) or duration <= 0:
                    reasons.append(EdgeReason("invalid_model_duration", "movement_model", "Movement model returned an invalid duration.", profile_id))
                    duration = None
        results.append(ParticipantEdgeResult(profile_id, not reasons, duration, tuple(reasons), (participant.parameters.model_id, model.evidence_id)))
    allowed = all(result.allowed for result in results)
    if not allowed:
        return GroupEdgeResult(False, None, tuple(results), (), tuple(reason for result in results for reason in result.reasons))
    duration = max(result.duration_s for result in results)
    limiting = tuple(result.participant_id for result in results if math.isclose(result.duration_s, duration, rel_tol=1e-12))
    return GroupEdgeResult(True, duration, tuple(results), limiting, ())


def evaluate_path(team: tuple[EffectiveParticipant, ...], edges: tuple[DirectedMetricEdge, ...]) -> tuple[GroupEdgeResult, ...]:
    """Return edge results so callers sum edge maxima, never whole-person totals."""
    return tuple(evaluate_edge(team, edge) for edge in edges)
