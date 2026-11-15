"""Reproduce synthetic full-mission decisions: python -m engine.mission_example."""

from dataclasses import asdict, replace
import json

import numpy as np

from .catalog import CATALOG
from .graph import build_graph
from .grid import MetricGrid
from .mission import (
    DaylightWindow, Departure, MissionTask, PhysicalTimeline, SnapshotReference, evaluate_mission,
)
from .routing import RouteLeg, routes_to, search_from_base
from .team import resolve_team
from .templates import MISSION_TEMPLATES, export_mission_templates


def example():
    request = {
        "catalog_version": CATALOG.version,
        "humans": [{"profile_id": "explorer_01", "payload_kg": 0}],
        "robots": [{"profile_id": "support_rover", "payload_kg": 0}],
    }
    members = resolve_team(CATALOG, request)
    grid = MetricGrid(
        elevation_m=np.zeros((1, 2)), coverage=np.ones((1, 2), dtype=bool),
        excluded=np.zeros((1, 2), dtype=bool), spacing_m=(30, 30), origin_center_xy_m=(0, 0),
        row_direction="decreasing_y", data_version="synthetic-mission-flat-v1", fixture=True,
        aggregation_policy="Synthetic exact cell centers and whole-cell masks; no subcell evidence.",
    )
    routes = routes_to(search_from_base(build_graph(grid, members), (0, 0)), (0, 1))
    axis = PhysicalTimeline("synthetic-replay-epoch-v1")
    snapshot = SnapshotReference(
        scenario_id="synthetic-mission-replay", scenario_version="v1", snapshot_id="synthetic-as-of-v1",
        as_of_utc="2025-10-25T12:00:00Z", available_at_utc="2025-10-25T11:00:00Z",
        availability_policy="Assumed fixture availability, not reconstructed NASA records or historical operational knowledge.",
        evaluation_location_id="synthetic-metric-parcel", fixture=True,
    )
    daylight = DaylightWindow(axis, 100, 5000, snapshot.evaluation_location_id,
                              "Explicit fixture physical seconds; no UTC/Mars clock or solar conversion.",
                              "synthetic-daylight-v1", "assumed")
    template = next(item for item in MISSION_TEMPLATES if item.id == "reconnaissance")
    common = dict(routes=routes, tasks=template.tasks, participants=members,
                  time_budget_s=template.time_budget_s, reserve_s=template.reserve_s,
                  departure=Departure(axis, 100), daylight=daylight, snapshot=snapshot)

    def case(case_id, **changes):
        args = {**common, **changes}
        return {
            "id": case_id, "fixture": True,
            "input_overrides": {key: ([asdict(item) for item in value] if key in ("tasks", "participants") else
                                       asdict(value) if key in ("routes", "departure", "daylight", "snapshot") and value is not None else value)
                                for key, value in changes.items()},
            "result": asdict(evaluate_mission(**args)),
        }

    # A separately searched directed fixture demonstrates an actual absent return.
    one_way_members = resolve_team(CATALOG, {
        "catalog_version": CATALOG.version,
        "humans": [{"profile_id": "explorer_01", "payload_kg": 0,
                    "mission_overrides": {"max_ascent_deg": 15, "max_descent_deg": 5}}], "robots": [],
    })
    one_way_grid = replace(grid, elevation_m=np.array([[0., 14.]]), spacing_m=(100, 100), data_version="synthetic-one-way-v1")
    one_way = routes_to(search_from_base(build_graph(one_way_grid, one_way_members), (0, 0)), (0, 1))
    one_way_snapshot = replace(snapshot, snapshot_id="synthetic-one-way-as-of-v1", evaluation_location_id="synthetic-one-way-parcel")
    return {
        "fixture": True,
        "label": "Synthetic development examples; no real parcel, measured weather, solar conversion or operational safety claim.",
        "templates": export_mission_templates(),
        "common_input": {
            "team_request": request, "participants": [asdict(member) for member in members],
            "template_id": template.id, "tasks": [asdict(task) for task in common["tasks"]],
            "time_budget_s": common["time_budget_s"], "reserve_s": common["reserve_s"],
            "departure": asdict(common["departure"]), "daylight": asdict(daylight), "snapshot": asdict(snapshot),
            "routes": asdict(routes), "grid": {
                "elevation_m": grid.elevation_m.tolist(), "coverage": grid.coverage.tolist(),
                "excluded": grid.excluded.tolist(), "terrain_slope_deg": None,
                "spacing_m": grid.spacing_m, "origin_center_xy_m": grid.origin_center_xy_m,
                "row_direction": grid.row_direction, "data_version": grid.data_version, "fixture": grid.fixture,
                "aggregation_policy": grid.aggregation_policy, "base": [0, 0], "destination": [0, 1],
            },
        },
        "one_way_grid_overrides": {"elevation_m": [[0, 14]], "spacing_m": [100, 100], "data_version": one_way_grid.data_version},
        "cases": [
            case("baseline"),
            case("mission_budget_exceeded", time_budget_s=2599),
            case("robot_limit_exceeded_by_task", tasks=(MissionTask("extended_assumed_task", 16001),),
                 daylight=replace(daylight, end_s=50000)),
            case("exact_daylight_boundary", departure=Departure(axis, 2400)),
            case("daylight_overrun", departure=Departure(axis, 2400.001)),
            case("missing_daylight", daylight=None),
            case("no_return_in_domain", routes=one_way, participants=one_way_members, snapshot=one_way_snapshot,
                 daylight=replace(daylight, evaluation_location_id=one_way_snapshot.evaluation_location_id)),
            case("inconclusive_search", routes=replace(routes, return_leg=RouteLeg("search_inconclusive", "Explicit simulated interruption; no partial result."))),
        ],
    }


if __name__ == "__main__":
    print(json.dumps(example(), indent=2, allow_nan=False))
