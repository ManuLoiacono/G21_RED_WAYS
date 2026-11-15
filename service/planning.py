"""One bounded movement context and base search, with fresh mission evaluation."""

from dataclasses import asdict, dataclass
import math
from threading import Lock

import scipy

from engine import (
    CATALOG, EffectiveParticipant, MissionAssessment, RoundTripRoutes,
    build_graph, evaluate_mission, resolve_team, routes_to, search_from_base,
)
from engine.graph import MODEL_VERSION
from .prepared import PreparedParcel, ResolvedLocation, resolve_location
from .scenarios import SelectedScenario, select_scenario
from .validation import PlanningInputError, canonical, identity


def team_signature(members):
    return tuple(canonical({"kind": member.kind, "profile_id": member.identity.profile_id,
                            "parameters": asdict(member.parameters), "payload_kg": member.payload_kg})
                 for member in sorted(members, key=lambda item: item.identity.profile_id))


@dataclass(frozen=True)
class MovementContext:
    id: str
    parcel_content_id: str
    catalog_version: str
    backend_version: str
    movement_model_version: str
    team_signature: tuple[str, ...]
    applied_movement_effects: tuple[str, ...] = ()


def movement_context(parcel, members):
    backend = f"directed-eight-neighbor-csr-v1/scipy-{scipy.__version__}"
    signature = team_signature(members)
    inputs = {"parcel_id": parcel.id, "parcel_version": parcel.version, "content_id": parcel.content_id,
              "data_version": parcel.grid.data_version, "mask_version": parcel.mask_version, "slope_version": parcel.slope_version,
              "spacing_m": parcel.grid.spacing_m, "origin_center_xy_m": parcel.grid.origin_center_xy_m,
              "row_direction": parcel.grid.row_direction, "catalog": CATALOG.version,
              "backend": backend, "model": MODEL_VERSION, "team": signature, "applied_movement_effects": []}
    return MovementContext(identity(inputs), parcel.content_id, CATALOG.version, backend, MODEL_VERSION, signature)


class PlannerBusyError(RuntimeError):
    """One planner instance permits one active calculation; no cancellation claim."""


@dataclass(frozen=True)
class PlanEvaluation:
    parcel: PreparedParcel
    origin: ResolvedLocation
    destination: ResolvedLocation
    participants: tuple[EffectiveParticipant, ...]
    context: MovementContext
    selected_scenario: SelectedScenario
    routes: RoundTripRoutes
    mission: MissionAssessment
    graph_reused: bool
    search_reused: bool


class PreparedPlanner:
    """Retains at most one graph and one complete associated base search.

    Returned results contain compact route evidence, not graph/search arrays.
    Registry inputs and native temporary build/search allocations are additional.
    """

    def __init__(self, registry):
        self.registry = registry
        self._graph = self._search = self._context = self._base = None
        self._lock = Lock()

    def plan(self, *, parcel_id, parcel_version, scenario_id, scenario_version, origin, destination,
             team, tasks, time_budget_s, reserve_s, departure_utc, as_of_utc):
        if not self._lock.acquire(blocking=False):
            raise PlannerBusyError("A calculation is already active on this planner instance.")
        try:
            return self._plan(parcel_id, parcel_version, scenario_id, scenario_version, origin, destination,
                              team, tasks, time_budget_s, reserve_s, departure_utc, as_of_utc)
        finally:
            self._lock.release()

    def _plan(self, parcel_id, parcel_version, scenario_id, scenario_version, origin, destination,
              team, tasks, time_budget_s, reserve_s, departure_utc, as_of_utc):
        parcel = self.registry.parcel(parcel_id, parcel_version)
        scenario = self.registry.scenario(scenario_id, scenario_version, parcel)
        start = resolve_location(parcel, origin, "origin")
        end = resolve_location(parcel, destination, "destination")
        members = tuple(sorted(resolve_team(CATALOG, team), key=lambda member: member.identity.profile_id))
        location = None
        if parcel.geographic_adapter:
            lon, lat = (math.degrees(v / parcel.geographic_adapter["radius_m"]) for v in start.effective_xy_m)
            location = (lon, lat, f"analytical-origin:{identity(start.effective_xy_m)}")
        selected = select_scenario(scenario, as_of_utc, departure_utc, evaluation_location=location)
        context = movement_context(parcel, members)
        graph_reused = self._context == context and self._graph is not None
        if not graph_reused:
            # Clear incompatible references BEFORE allocating replacement arrays.
            self._search = self._graph = self._context = self._base = None
            self._graph = build_graph(parcel.grid, members)
            self._context = context
        if self._graph.grid is not parcel.grid or team_signature(self._graph.team) != context.team_signature:
            self._search = self._graph = self._context = self._base = None
            raise PlanningInputError("stale_movement_context", "movement_context", "Movement does not belong to the effective team/parcel.")
        search_reused = self._search is not None and self._base == start.cell
        if not search_reused:
            self._search = self._base = None
            search = search_from_base(self._graph, start.cell)
            if search.status == "complete":
                self._search, self._base = search, start.cell
        else:
            search = self._search
        if search.graph is not self._graph or search.base_index != parcel.grid.index(start.cell):
            self._search = self._base = None
            raise PlanningInputError("stale_movement_context", "movement_context", "Search does not belong to the active graph/base.")
        routes = routes_to(search, end.cell)
        mission = evaluate_mission(routes, tasks, members, time_budget_s=time_budget_s, reserve_s=reserve_s,
                                   departure=selected.departure, daylight=selected.daylight, snapshot=selected.snapshot)
        return PlanEvaluation(parcel, start, end, members, context, selected, routes, mission, graph_reused, search_reused)
