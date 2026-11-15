"""Physical group exposure using a consistent source/target half-edge rule."""

import math


def communication_metrics(routes, states, tasks_s):
    if routes.outbound.status != "found" or routes.return_leg.status != "found":
        return {"status": "unevaluated", "reason": "complete_route_unavailable"}
    samples = []
    def leg(route):
        for a, b, edge in zip(route.cells, route.cells[1:], route.edge_results):
            samples.extend(((int(states[a]), edge.duration_s / 2), (int(states[b]), edge.duration_s / 2)))
    leg(routes.outbound)
    samples.append((int(states[routes.outbound.cells[-1]]), tasks_s))
    leg(routes.return_leg)
    totals = {state: math.fsum(duration for value, duration in samples if value == state) for state in (0, 1, 2)}
    longest = running = 0.0
    for state, duration in samples:
        if duration == 0:
            continue
        running = 0.0 if state == 1 else running + duration
        longest = max(longest, running)
    return {"status": "evaluated", "method": "source-target-half-edge-v1", "visible_s": totals[1],
            "occluded_s": totals[2], "unknown_s": totals[0], "without_confirmed_s": totals[0] + totals[2],
            "max_without_confirmed_s": longest, "tasks_s": tasks_s, "reserve_exposure_s": 0,
            "scope": "geometric preference only; maximum interruption evaluated, not constrained by additive search"}
