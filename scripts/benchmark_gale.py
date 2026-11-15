"""Measure a real package with the existing benchmark's native memory high-water method."""

import argparse
import json
from pathlib import Path
import platform
from time import perf_counter
from unittest.mock import patch

import numpy as np
import scipy

from engine.routing_benchmark import peak_rss_bytes
from service import planning
from service.exchange import plan_draft
from service.gale import gale_registry
from service.planning import PreparedPlanner


def benchmark(manifest, request_file, response_file=None):
    timings, peaks = {}, {"after_imports": peak_rss_bytes()}
    start = perf_counter()
    registry = gale_registry(manifest)
    timings["package_load"] = perf_counter()-start
    peaks["after_package_load"] = peak_rss_bytes()
    planner = PreparedPlanner(registry)
    request = json.loads(Path(request_file).read_text(encoding="utf-8"))

    def measured(name, function):
        def call(*args, **kwargs):
            start = perf_counter()
            result = function(*args, **kwargs)
            timings[name] = perf_counter()-start
            peaks[f"after_{name}"] = peak_rss_bytes()
            return result
        return call

    with patch.object(planning, "build_graph", measured("graph_build", planning.build_graph)), \
            patch.object(planning, "search_from_base", measured("two_source_searches", planning.search_from_base)), \
            patch.object(planning, "routes_to", measured("reconstruction", planning.routes_to)):
        response = plan_draft(planner, request)
    if response_file:
        Path(response_file).write_text(json.dumps(response, indent=2, allow_nan=False)+"\n", encoding="utf-8")
    graph, search = planner._graph, planner._search
    parcel = registry.parcel(request["parcel"]["id"], request["parcel"]["version"])
    candidate = response["alternatives"][0]
    return {"terrain_fixture": False, "environment_fixture": response["input_provenance"]["scenario_fixture"],
            "request": request, "versions": response["versions"], "locations": response["locations"],
            "grid": {"shape": parcel.grid.shape, "spacing_m": parcel.grid.spacing_m,
                     "nodes": graph.grid.node_count, "traversable_nodes": int(graph.traversable.sum()), "directed_edges": graph.csr.nnz},
            "runtime": {"python": platform.python_version(), "numpy": np.__version__, "scipy": scipy.__version__, "platform": platform.platform()},
            "timing_s": timings, "process_peak_rss_bytes": peaks,
            "storage_bytes": {"csr": graph.csr_bytes, "search_arrays": search.array_bytes if search else None},
            "assessment": response["assessment"], "search_status": response["search_status"],
            "missing_required": response["environment"]["missing_required"],
            "legs": {name: {k: v for k, v in candidate[name].items() if k not in ("cells", "xy_m")} |
                           {"vertices": len(candidate[name]["xy_m"])} for name in ("outbound", "return")},
            "metrics": candidate["metrics"],
            "memory_note": "OS process high-water RSS includes runtime, imports, native workspaces and allocator retention; not incremental allocation."}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", default="data/processed/gale/analytical/manifest.json")
    parser.add_argument("--request", default="service/examples/gale.request.json")
    parser.add_argument("--response", help="Optional local full calculated response output.")
    parser.add_argument("--out", default="docs/evidence/gale-routing-benchmark.json")
    args = parser.parse_args()
    output = Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(benchmark(args.manifest, args.request, args.response), indent=2, allow_nan=False)+"\n", encoding="utf-8")
    print(str(output))
