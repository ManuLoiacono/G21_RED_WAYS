"""Run with python -m engine.routing_example; all input and movement is synthetic."""

from dataclasses import asdict
import json

import numpy as np

from .catalog import CATALOG
from .graph import build_graph
from .grid import MetricGrid
from .routing import routes_to, search_from_base
from .team import resolve_team


def example():
    request = {
        "catalog_version": CATALOG.version,
        "humans": [{"profile_id": "explorer_01", "payload_kg": 0,
                    "mission_overrides": {"max_ascent_deg": 15, "max_descent_deg": 5}}],
        "robots": [],
    }
    grid = MetricGrid(
        elevation_m=np.array([[7., 14., 21.], [0., 14., 28.]]),
        coverage=np.ones((2, 3), dtype=bool), excluded=np.zeros((2, 3), dtype=bool),
        spacing_m=(100, 100), origin_center_xy_m=(0, 0), row_direction="decreasing_y",
        data_version="synthetic-asymmetric-return-v1", fixture=True,
        aggregation_policy="Synthetic exact cell centers; no subcell terrain evidence; whole-cell masks.",
    )
    graph = build_graph(grid, resolve_team(CATALOG, request))
    result = routes_to(search_from_base(graph, (1, 0)), (1, 2))
    return {
        "fixture": True,
        "input": {
            "team": request, "elevation_m": grid.elevation_m.tolist(), "coverage": grid.coverage.tolist(),
            "excluded": grid.excluded.tolist(), "terrain_slope_deg": None,
            "spacing_m": grid.spacing_m, "origin_center_xy_m": grid.origin_center_xy_m,
            "row_direction": grid.row_direction, "data_version": grid.data_version,
            "aggregation_policy": grid.aggregation_policy, "base": [1, 0], "destination": [1, 2],
        },
        "graph": {"nodes": grid.node_count, "directed_edges": graph.csr.nnz, "csr_bytes": graph.csr_bytes},
        "routes": asdict(result),
    }


if __name__ == "__main__":
    print(json.dumps(example(), indent=2, allow_nan=False))
