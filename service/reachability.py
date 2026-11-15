"""Explicit compact area endpoint; movement searches reused, no per-cell routes."""

import base64
import math
import numpy as np
from dataclasses import asdict

from engine import GridInputError, MissionInputError
from engine.reachability import LEGEND, METHOD, pack_states, reachable_states
from .exchange import decode_request
from .planning import PlannerBusyError
from .validation import PlanningInputError, identity, loads_strict


def reachable_area(planner, payload):
    request = decode_request(payload)
    value = loads_strict(request.canonical_json)
    if not planner._lock.acquire(blocking=False):
        raise PlannerBusyError("A calculation is already active on this planner instance.")
    try:
        mission = value["mission"]
        result = planner._plan(parcel_id=value["parcel"]["id"], parcel_version=value["parcel"]["version"],
            scenario_id=value["scenario"]["id"], scenario_version=value["scenario"]["version"],
            origin=value["origin"], destination=value["destination"], team=value["team"], tasks=request.tasks,
            time_budget_s=mission["time_budget_s"], reserve_s=mission["reserve_s"],
            departure_utc=mission["departure_utc"], as_of_utc=value["scenario"]["as_of_utc"])
        selected = result.selected_scenario
        states = reachable_states(planner._graph, planner._search, tasks_s=result.mission.tasks_s,
            reserve_s=mission["reserve_s"], time_budget_s=mission["time_budget_s"], participants=result.participants,
            departure=selected.departure, daylight=selected.daylight)
        grid = result.parcel.grid
        applicability = {"method": METHOD, "movement_context": result.context.id, "base_cell": result.origin.cell,
            "mission": mission, "snapshot": asdict(selected.snapshot), "daylight": asdict(selected.daylight) if selected.daylight else None,
            "departure": asdict(selected.departure)}
        return {"schema_version": "p2-reachable-area-1", "request_echo": value, "id": identity(applicability),
            "applicability": applicability, "parcel_content_id": result.parcel.content_id,
            "grid": {"shape": grid.shape, "spacing_m": grid.spacing_m, "origin_center_xy_m": grid.origin_center_xy_m,
                     "row_direction": grid.row_direction}, "geographic_adapter": result.parcel.geographic_adapter,
            "encoding": "base64-u4-low-nibble-first-row-major", "data": base64.b64encode(pack_states(states)).decode("ascii"),
            "legend": LEGEND, "counts": {str(code): int(np.count_nonzero(states == code)) for code in LEGEND},
            "evaluated_cells": grid.node_count, "resolution_m": grid.spacing_m,
            "search_status": result.mission.search_status,
            "movement_reuse": {"graph": result.graph_reused, "base_search": result.search_reused},
            "scope": "Complete fastest directed sortie from this base, sequential destination tasks and unused reserve; base-location daylight convention. Communication is a preference and does not shrink this layer. Status 4 is not fully feasible."}
    except (GridInputError, MissionInputError) as exc:
        raise PlanningInputError(exc.code, exc.path, str(exc)) from exc
    finally:
        planner._lock.release()
