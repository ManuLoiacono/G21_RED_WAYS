"""Pure reevaluation of a simulated sortie from a position on its calculated route (P2-11).

The position is simulated (no localization). A delay event does not change terrain or the
movement model, so the not-yet-travelled part of each calculated leg is still the same
movement result: remaining time is the sum of the leg's own edge durations after the
position. Two options are evaluated with the unchanged complete-mission rules
(``evaluate_mission``); budgets and participant limits are never reset:

* ``continue``: the calculated sortie plus the cumulative event delay;
* ``return_now``: what was already done, plus the fastest return from the current cell to
  the base taken from the complete base search (not offered once the return leg started).

Terrain blockage events are not evaluated here.
"""

from dataclasses import dataclass, replace
import math

from .mission import MissionAssessment, MissionInputError, MissionTask, evaluate_mission
from .routing import RoundTripRoutes, RouteLeg, RoutingSearch, reconstruct_route

PROGRESS_MODEL_VERSION = "simulated-progress-v1"
PHASES = ("outbound", "tasks", "return")
DELAY_TASK_ID = "simulated_event_delay"
DONE_TASK_ID = "tasks_completed_before_return"
ASSESSMENT_RANK = {"viable_model": 0, "insufficient_evidence": 1, None: 2, "incompatible": 3}


@dataclass(frozen=True)
class SimulatedProgress:
    """Where the simulated party is: a vertex of the current leg, or inside the task block."""

    phase: str
    vertex_index: int
    tasks_done_s: float
    delay_s: float


@dataclass(frozen=True)
class ProgressOption:
    id: str
    routes: RoundTripRoutes
    tasks: tuple[MissionTask, ...]
    mission: MissionAssessment
    completes_tasks: bool


@dataclass(frozen=True)
class ProgressEvaluation:
    progress: SimulatedProgress
    position_cell: tuple[int, int]
    position_xy_m: tuple[float, float]
    elapsed_at_event_s: float
    options: tuple[ProgressOption, ...]
    recommended: str
    reason: str
    model_version: str = PROGRESS_MODEL_VERSION


def _number(value, path, minimum=0.0):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < minimum:
        raise MissionInputError("invalid_number", path, f"Expected a finite number >= {minimum}.")
    return float(value)


def _found(leg: RouteLeg, path: str) -> RouteLeg:
    if leg.status != "found" or leg.duration_s is None or not leg.cells or len(leg.edge_results) != len(leg.cells) - 1:
        raise MissionInputError("leg_unavailable", path, "Progress requires a found leg with its edge evidence.")
    return leg


def _prefix(leg: RouteLeg, index: int) -> RouteLeg:
    """The already-travelled part of a leg, up to and including vertex ``index``."""
    duration = math.fsum(edge.duration_s for edge in leg.edge_results[:index])
    xy = leg.xy_m[: index + 1]
    distance = math.fsum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(xy, xy[1:]))
    return replace(leg, cells=leg.cells[: index + 1], xy_m=xy, duration_s=duration, search_cost_s=duration,
                   horizontal_distance_m=distance, ascent_m=None, descent_m=None, edge_results=leg.edge_results[:index])


def evaluate_progress(
    routes: RoundTripRoutes,
    tasks: tuple[MissionTask, ...],
    participants,
    progress: SimulatedProgress,
    base_search: RoutingSearch,
    *,
    time_budget_s: float,
    reserve_s: float,
    departure,
    daylight,
    snapshot,
) -> ProgressEvaluation:
    """Evaluate continuing versus returning now; never resets limits or invents geometry."""
    if progress.phase not in PHASES:
        raise MissionInputError("invalid_phase", "progress.phase", "Choose outbound, tasks or return.")
    delay = _number(progress.delay_s, "progress.delay_s")
    if any(task.id in (DELAY_TASK_ID, DONE_TASK_ID) for task in tasks):
        raise MissionInputError("reserved_task_id", "tasks", "Task IDs used by progress evaluation are reserved.")
    outbound = _found(routes.outbound, "routes.outbound")
    inbound = _found(routes.return_leg, "routes.return_leg")
    if base_search.status != "complete" or base_search.graph.grid.index(outbound.cells[0]) != base_search.base_index:
        raise MissionInputError("search_mismatch", "base_search", "The return search must be complete and start at this route's base.")
    tasks_total = math.fsum(task.duration_s for task in tasks)
    done = _number(progress.tasks_done_s, "progress.tasks_done_s")
    if isinstance(progress.vertex_index, bool) or not isinstance(progress.vertex_index, int):
        raise MissionInputError("invalid_index", "progress.vertex_index", "Expected an integer vertex index.")
    leg = {"outbound": outbound, "tasks": outbound, "return": inbound}[progress.phase]
    index = len(outbound.cells) - 1 if progress.phase == "tasks" else progress.vertex_index
    if not 0 <= index < len(leg.cells):
        raise MissionInputError("index_out_of_range", "progress.vertex_index", "Vertex is not on the current leg.")
    if progress.phase == "tasks" and done > tasks_total + 1e-6:
        raise MissionInputError("tasks_overrun", "progress.tasks_done_s", "Completed task time exceeds the planned tasks.")
    if progress.phase != "tasks" and done != (tasks_total if progress.phase == "return" else 0):
        raise MissionInputError("tasks_phase_mismatch", "progress.tasks_done_s", "Task time is fixed outside the task phase.")

    travelled_out = _prefix(outbound, index) if progress.phase == "outbound" else outbound
    elapsed = math.fsum((travelled_out.duration_s, done, delay,
                         _prefix(inbound, index).duration_s if progress.phase == "return" else 0.0))
    delay_task = (MissionTask(DELAY_TASK_ID, delay),) if delay > 0 else ()
    common = dict(time_budget_s=time_budget_s, reserve_s=reserve_s, departure=departure, daylight=daylight, snapshot=snapshot)

    options = [ProgressOption("continue", routes, (*tasks, *delay_task),
                              evaluate_mission(routes, (*tasks, *delay_task), participants, **common), True)]
    if progress.phase != "return":
        cell = leg.cells[index]
        home = reconstruct_route(base_search, cell, leg="return")
        early = RoundTripRoutes(travelled_out, home, routes.fixture, routes.data_version, routes.movement_model_version, routes.not_evaluated)
        done_task = (MissionTask(DONE_TASK_ID, done),) if done > 0 else ()
        early_tasks = (*done_task, *delay_task)
        options.append(ProgressOption("return_now", early, early_tasks,
                                      evaluate_mission(early, early_tasks, participants, **common), False))

    keep, back = options[0], options[1] if len(options) > 1 else None
    if keep.mission.assessment == "viable_model":
        recommended, reason = "continue", "continue_within_limits"
    elif back is None:
        recommended, reason = "continue", "already_returning"
    elif ASSESSMENT_RANK[back.mission.assessment] < ASSESSMENT_RANK[keep.mission.assessment]:
        recommended, reason = "return_now", "return_keeps_limits"
    elif (back.mission.reserved_total_s is not None and keep.mission.reserved_total_s is not None
          and back.mission.reserved_total_s < keep.mission.reserved_total_s):
        recommended, reason = "return_now", "return_ends_sooner"
    else:
        recommended, reason = "continue", "no_better_option"
    position = leg.cells[index]
    return ProgressEvaluation(progress, position, leg.xy_m[index], elapsed, tuple(options), recommended, reason)
