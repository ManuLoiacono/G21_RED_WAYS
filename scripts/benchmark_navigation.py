"""Reproducible whole-process real-grid navigation extension measurement."""

import json
from pathlib import Path
from time import perf_counter

import numpy as np
from engine.routing_benchmark import peak_rss_bytes
from service.gale import gale_registry
from service.planning import PreparedPlanner
from service.exchange import plan_draft


def benchmark():
    timing, output = {}, {}
    def measured(name, function):
        start = perf_counter()
        result = function()
        timing[name] = perf_counter() - start
        output[name] = len(json.dumps(result, separators=(",", ":")).encode()) if isinstance(result, dict) else None
        return result
    registry = measured("startup", lambda: gale_registry("data/processed/gale/analytical/manifest.json"))
    planner = PreparedPlanner(registry)
    request = json.loads(Path("service/examples/gale-replay.request.json").read_text())
    baseline = measured("first_fastest", lambda: plan_draft(planner, request))
    measured("warm_fastest", lambda: plan_draft(planner, request))
    request["options"] = {"visibility": True}
    result = measured("first_visibility", lambda: plan_draft(planner, request))
    measured("warm_visibility", lambda: plan_draft(planner, request))
    values, counts = np.unique(planner._visibility.states, return_counts=True)
    request["criterion"] = "comparison"
    comparison = measured("comparison", lambda: plan_draft(planner, request))
    distinct_request = json.loads(Path("service/examples/gale-comparison.request.json").read_text())
    distinct = measured("distinct_comparison", lambda: plan_draft(planner, distinct_request))
    from service.recommendations import recommendations
    suggestions = measured("recommendations", lambda: recommendations(planner, request))
    return {"method": "real-grid-navigation-benchmark-v1", "timing_s": timing, "serialized_bytes": output,
            "grid_cells": planner._graph.grid.node_count, "directed_edges": planner._graph.csr.nnz,
            "visibility_counts": dict(zip(map(str, values), map(int, counts))),
            "visibility": result["visibility"], "communication": result["alternatives"][0]["communication"],
            "baseline_metrics": baseline["alternatives"][0]["metrics"],
            "default_comparison_count": len(comparison["alternatives"]),
            "distinct_comparison": [{"criteria": a["criteria"], "metrics": a["metrics"], "optimization": a["optimization"]} for a in distinct["alternatives"]],
            "recommendations": {"attempted": suggestions["attempted"], "proposals": [{"id": p["id"], "assessment": p["assessment"], "delta": p["delta"]} for p in suggestions["proposals"]]},
            "peak_process_rss_bytes": peak_rss_bytes(),
            "memory_scope": "whole-process high-water RSS including native workspaces and allocator retention"}


if __name__ == "__main__":
    evidence = benchmark()
    path = Path("docs/evidence/navigation-extensions-performance.json")
    path.write_text(json.dumps(evidence, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps(evidence, indent=2))
