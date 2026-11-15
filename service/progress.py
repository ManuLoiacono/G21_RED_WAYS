"""Reevaluation from a simulated position on a calculated route (P2-11), over HTTP.

The request carries the unchanged plan request, the alternative being followed and the
simulated progress. The plan is recalculated with the same inputs (reusing the cached
movement graph/search) so that the evaluated legs are exactly the calculated ones; the
position must name a vertex of that leg. Nothing here is localization: positions,
delays and progress are simulated by the client.
"""

from dataclasses import asdict, replace
import json

from engine import MissionInputError, evaluate_mission
from engine.progress import PROGRESS_MODEL_VERSION, SimulatedProgress, evaluate_progress
from .exchange import _leg, decode_request, encode_metrics, run_plan
from .planning import PlannerBusyError
from .validation import PlanningInputError, canonical, fields, integer, number, text

PROGRESS_SCHEMA_VERSION = "p2-progress-1"
MAX_DELAY_S = 86_400


def reevaluate(planner, payload):
    value = fields(payload, ("schema_version", "request", "alternative_id", "progress"), ("return_alternative_id",), path="body")
    if value["schema_version"] != PROGRESS_SCHEMA_VERSION:
        raise PlanningInputError("unsupported_schema_version", "schema_version", f"Only {PROGRESS_SCHEMA_VERSION} is supported.")
    decode_request(value["request"])
    alternative_id = text(value["alternative_id"], "alternative_id")
    return_id = text(value.get("return_alternative_id", alternative_id), "return_alternative_id")
    raw = fields(value["progress"], ("phase", "vertex_index", "cell", "tasks_done_s", "delay_s"), path="progress")
    if raw["phase"] not in ("outbound", "tasks", "return"):
        raise PlanningInputError("invalid_phase", "progress.phase", "Choose outbound, tasks or return.")
    index = integer(raw["vertex_index"], "progress.vertex_index")
    if not isinstance(raw["cell"], list) or len(raw["cell"]) != 2:
        raise PlanningInputError("invalid_structure", "progress.cell", "Expected a [row, col] cell.")
    cell = tuple(integer(item, f"progress.cell[{i}]") for i, item in enumerate(raw["cell"]))
    done = number(raw["tasks_done_s"], "progress.tasks_done_s", minimum=0)
    delay = number(raw["delay_s"], "progress.delay_s", minimum=0)
    if delay > MAX_DELAY_S:
        raise PlanningInputError("delay_limit", "progress.delay_s", "Simulated delay exceeds the technical limit.")
    if not planner._lock.acquire(blocking=False):
        raise PlannerBusyError("A calculation is already active on this planner instance.")
    try:
        return _evaluate(planner, value, alternative_id, return_id, SimulatedProgress(raw["phase"], index, done, delay), cell)
    finally:
        planner._lock.release()


def _evaluate(planner, value, alternative_id, return_id, progress, cell):
    request, result = run_plan(planner, value["request"], internal=True)
    candidates = result.candidates or (result,)
    chosen = next((c for c in candidates if c.criteria[0] == alternative_id), None)
    back = next((c for c in candidates if c.criteria[0] == return_id), None)
    if chosen is None or back is None:
        raise PlanningInputError("unknown_alternative", "alternative_id" if chosen is None else "return_alternative_id",
                                 "The alternative is not part of this calculated plan.")
    if back is not chosen:
        # Outbound of one calculated alternative and return of another: both are complete movement
        # results from the same base/destination and team; the combination is evaluated afresh here.
        chosen = replace(chosen, routes=replace(chosen.routes, return_leg=back.routes.return_leg))
    leg = chosen.routes.return_leg if progress.phase == "return" else chosen.routes.outbound
    expected = leg.cells[-1] if progress.phase == "tasks" and leg.cells else (
        leg.cells[progress.vertex_index] if 0 <= progress.vertex_index < len(leg.cells) else None)
    if expected is None or tuple(expected) != cell:
        raise PlanningInputError("stale_progress", "progress.cell", "The simulated position is not on the calculated leg.")
    search = planner._search
    if search is None:
        raise PlanningInputError("search_unavailable", "planner", "No complete base search is available for the return option.")
    selected = chosen.selected_scenario
    try:
        evaluation = evaluate_progress(chosen.routes, request.tasks, chosen.participants, progress, search,
                                       time_budget_s=value["request"]["mission"]["time_budget_s"],
                                       reserve_s=value["request"]["mission"]["reserve_s"],
                                       departure=selected.departure, daylight=selected.daylight, snapshot=selected.snapshot)
    except MissionInputError as exc:
        raise PlanningInputError(exc.code, exc.path, str(exc)) from exc
    # The planned (no-event) sortie for exactly these legs; for a combination this is its own evaluation.
    planned = chosen.mission if return_id == alternative_id else evaluate_mission(
        chosen.routes, request.tasks, chosen.participants, time_budget_s=value["request"]["mission"]["time_budget_s"],
        reserve_s=value["request"]["mission"]["reserve_s"], departure=selected.departure, daylight=selected.daylight, snapshot=selected.snapshot)
    # Normalize tuples and verify every nested number is finite JSON before publication.
    return json.loads(canonical({
        "schema_version": PROGRESS_SCHEMA_VERSION, "model_version": PROGRESS_MODEL_VERSION,
        "request_echo": value["request"], "alternative_id": alternative_id, "return_alternative_id": return_id,
        "progress": asdict(progress), "position": {"cell": evaluation.position_cell, "xy_m": evaluation.position_xy_m},
        "elapsed_at_event_s": evaluation.elapsed_at_event_s,
        "planned": {"reserved_total_s": planned.reserved_total_s, "mission_margin_s": planned.mission_margin_s,
                    "assessment": planned.assessment, "metrics": encode_metrics(planned)},
        "options": [{"id": option.id, "assessment": option.mission.assessment, "search_status": option.mission.search_status,
                     "completes_tasks": option.completes_tasks, "metrics": encode_metrics(option.mission),
                     "checks": [asdict(check) for check in option.mission.checks],
                     "return": _leg(option.routes.return_leg)} for option in evaluation.options],
        "recommendation": {"option_id": evaluation.recommended, "reason": evaluation.reason},
        "not_evaluated": (*planned.not_evaluated, "terrain_blockage_event"),
        "scope": ("Simulated position and delay; not localization. Remaining movement reuses the calculated legs; "
                  "return_now uses the fastest path from the current cell to the base. Limits are never reset."),
    }))
