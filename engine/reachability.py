"""Vectorized complete-sortie statuses from two directed physical-time searches."""

import math
import numpy as np
from .mission import TIME_ABS_TOL_S

METHOD = "complete-directed-fastest-sortie-v1"
LEGEND = {0: "missing_coverage", 1: "not_admissible", 2: "no_complete_directed_sortie",
          3: "fails_mandatory_time_or_daylight", 4: "movement_time_only_missing_daylight",
          5: "fully_assessed_feasible_model", 6: "search_inconclusive"}


def reachable_states(graph, search, *, tasks_s, reserve_s, time_budget_s, participants, departure, daylight):
    grid = graph.grid
    states = np.zeros(grid.node_count, dtype=np.uint8)
    coverage = grid.coverage.ravel()
    states[coverage] = 1
    states[graph.traversable] = 6
    if search is None or search.status != "complete":
        return states.reshape(grid.shape)
    if search.graph is not graph:
        raise ValueError("Reachability searches must belong to the exact movement graph.")
    budget = min(time_budget_s, *(m.parameters.max_sortie_s for m in participants))
    departure_ok = daylight is not None and daylight.start_s - TIME_ABS_TOL_S <= departure.offset_s <= daylight.end_s + TIME_ABS_TOL_S
    for begin in range(0, grid.node_count, 65536):
        end = min(begin + 65536, grid.node_count)
        target = states[begin:end]
        admissible = graph.traversable[begin:end]
        out, ret = search.outbound_cost_s[begin:end], search.return_cost_s[begin:end]
        connected = admissible & np.isfinite(out) & np.isfinite(ret)
        target[admissible] = 2
        target[connected] = 3
        total = out + ret + tasks_s + reserve_s
        within_time = connected & (total <= budget + TIME_ABS_TOL_S)
        if daylight is None:
            target[within_time] = 4
        elif departure_ok:
            target[within_time & (total <= daylight.end_s - departure.offset_s + TIME_ABS_TOL_S)] = 5
    return states.reshape(grid.shape)


def pack_states(states):
    """Low nibble first, row-major, two cells per byte, zero unused nibble."""
    flat = np.asarray(states, dtype=np.uint8).ravel()
    packed = flat[::2].copy()
    packed[:flat[1::2].size] |= flat[1::2] << 4
    return packed.tobytes()


def unpack_states(data, shape):
    packed = np.frombuffer(data, dtype=np.uint8)
    size = math.prod(shape)
    if packed.size != (size + 1) // 2:
        raise ValueError("Packed layer size differs from its declared grid.")
    result = np.empty(packed.size * 2, dtype=np.uint8)
    result[::2], result[1::2] = packed & 15, packed >> 4
    if np.any(result[:size] > 6) or (size % 2 and result[-1] != 0):
        raise ValueError("Unknown status code or nonzero padding in packed layer.")
    return result[:size].reshape(shape)
