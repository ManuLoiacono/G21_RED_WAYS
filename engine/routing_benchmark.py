"""Reproducible synthetic build/search timings and process memory high-water marks."""

import argparse
import json
import os
import platform
import sys
from time import perf_counter

import numpy as np
import scipy

from .catalog import CATALOG
from .graph import build_graph
from .grid import MetricGrid
from .routing import routes_to, search_from_base
from .team import resolve_team


def peak_rss_bytes():
    """OS process peak resident memory, including imports and native allocations."""
    if sys.platform == "win32":
        import ctypes
        from ctypes import wintypes

        class MemoryCounters(ctypes.Structure):
            _fields_ = [("cb", wintypes.DWORD), ("page_faults", wintypes.DWORD)] + [
                (name, ctypes.c_size_t) for name in (
                    "peak_working_set", "working_set", "quota_peak_paged", "quota_paged",
                    "quota_peak_nonpaged", "quota_nonpaged", "pagefile", "peak_pagefile")
            ]

        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.GetCurrentProcess.restype = wintypes.HANDLE
        psapi = ctypes.WinDLL("psapi", use_last_error=True)
        psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(MemoryCounters), wintypes.DWORD]
        psapi.GetProcessMemoryInfo.restype = wintypes.BOOL
        counters = MemoryCounters()
        counters.cb = ctypes.sizeof(counters)
        if not psapi.GetProcessMemoryInfo(kernel.GetCurrentProcess(), ctypes.byref(counters), counters.cb):
            raise ctypes.WinError(ctypes.get_last_error())
        return int(counters.peak_working_set)
    import resource
    value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return int(value if sys.platform == "darwin" else value * 1024)


def benchmark(rows, cols, block_cells):
    baseline_peak = peak_rss_bytes()
    start = perf_counter()
    elevation = 0.02 * np.arange(rows)[:, None] + 0.04 * np.arange(cols)[None, :]
    grid = MetricGrid(
        elevation_m=elevation, coverage=np.ones((rows, cols), dtype=bool), excluded=np.zeros((rows, cols), dtype=bool),
        terrain_slope_deg=np.full((rows, cols), 2.), spacing_m=(2, 2), origin_center_xy_m=(0, 0),
        row_direction="decreasing_y", data_version="synthetic-plane-benchmark-v1", fixture=True,
        aggregation_policy="Synthetic plane; assumed 2-degree cell summary; whole-cell coverage, no exclusions.",
    )
    del elevation
    grid_s = perf_counter() - start
    grid_peak = peak_rss_bytes()
    members = resolve_team(CATALOG, {"catalog_version": CATALOG.version,
                           "humans": [{"profile_id": "explorer_01", "payload_kg": 0}],
                           "robots": [{"profile_id": "transport_rover", "payload_kg": 0}]})
    start = perf_counter()
    graph = build_graph(grid, members, block_cells=block_cells)
    build_s = perf_counter() - start
    build_peak = peak_rss_bytes()
    start = perf_counter()
    search = search_from_base(graph, (0, 0))
    search_s = perf_counter() - start
    search_peak = peak_rss_bytes()
    start = perf_counter()
    routes = routes_to(search, (rows - 1, cols - 1))
    reconstruct_s = perf_counter() - start
    grid_bytes = sum(value.nbytes for value in (grid.elevation_m, grid.coverage, grid.excluded, grid.terrain_slope_deg))
    return {
        "fixture": True, "data_version": grid.data_version, "movement_model_version": routes.movement_model_version,
        "runtime": {"python": platform.python_version(), "numpy": np.__version__, "scipy": scipy.__version__,
                    "platform": platform.platform(), "machine": platform.machine(), "logical_cpus": os.cpu_count()},
        "grid": {"rows": rows, "cols": cols, "spacing_m": grid.spacing_m, "nodes": grid.node_count,
                 "traversable_nodes": int(np.count_nonzero(graph.traversable)), "directed_edges": graph.csr.nnz,
                 "block_cells": block_cells, "participants": [member.identity.profile_id for member in members]},
        "timing_s": {"grid_validation": grid_s, "graph_build": build_s, "two_source_searches": search_s, "reconstruction": reconstruct_s},
        "storage_bytes": {"grid_snapshots": grid_bytes, "csr": graph.csr_bytes, "traversable_mask": graph.traversable.nbytes,
                          "search_arrays": search.array_bytes,
                          "retained_arrays_total": grid_bytes + graph.csr_bytes + graph.traversable.nbytes + search.array_bytes,
                          "construction_workspace_planning_allowance": 4 * grid.node_count + 256 * min(block_cells, grid.node_count)},
        "process_peak_rss_bytes": {"after_imports": baseline_peak, "after_grid": grid_peak, "after_build": build_peak,
                                   "after_search": search_peak, "after_reconstruction": peak_rss_bytes()},
        "routes": {"outbound_status": routes.outbound.status, "return_status": routes.return_leg.status,
                   "outbound_cells": len(routes.outbound.cells), "return_cells": len(routes.return_leg.cells),
                   "outbound_duration_s": routes.outbound.duration_s, "return_duration_s": routes.return_leg.duration_s},
        "not_evaluated": routes.not_evaluated,
        "memory_note": "OS process high-water RSS includes runtime/imports, native search/transpose scratch and allocator retention; it is not incremental allocation or a production parcel measurement.",
    }


def positive_integer(value):
    result = int(value)
    if result <= 0:
        raise argparse.ArgumentTypeError("Value must be a positive integer.")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rows", type=positive_integer, default=256)
    parser.add_argument("--cols", type=positive_integer, default=256)
    parser.add_argument("--block-cells", type=positive_integer, default=65536)
    args = parser.parse_args()
    print(json.dumps(benchmark(args.rows, args.cols, args.block_cells), indent=2, allow_nan=False))
