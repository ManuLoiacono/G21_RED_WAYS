import math

from engine import CATALOG, CellTerrain, DirectedMetricEdge, evaluate_edge, evaluate_path, resolve_team


def team(humans, robots=()):
    return resolve_team(CATALOG, {
        "catalog_version": CATALOG.version,
        "humans": [{"profile_id": profile_id, "payload_kg": 0} for profile_id in humans],
        "robots": [{"profile_id": profile_id, "payload_kg": 0} for profile_id in robots],
    })


def edge(rise=0, source=None, target=None):
    return DirectedMetricEdge(
        source or CellTerrain("firm", 0.0), target or CellTerrain("firm", rise), 100.0, rise
    )


def codes(result):
    return {reason.code for reason in result.reasons}


def run():
    slow = evaluate_edge(team(("explorer_01",)), edge())
    fast = evaluate_edge(team(("explorer_02",)), edge())
    assert slow.allowed and fast.allowed
    assert (slow.duration_s, fast.duration_s) == (250.0, 200.0)
    group = evaluate_edge(team(("explorer_01", "explorer_02")), edge())
    assert group.duration_s == slow.duration_s
    assert group.limiting_participant_ids == ("explorer_01",)

    mixed = team(("explorer_01",), ("transport_rover",))
    uphill = edge(14)
    outbound, inbound = evaluate_path(mixed, (uphill, uphill.reversed()))
    assert outbound.allowed and inbound.allowed
    assert outbound.limiting_participant_ids == ("explorer_01",)
    assert inbound.limiting_participant_ids == ("transport_rover",)
    edge_maxima = outbound.duration_s + inbound.duration_s
    person_totals = [sum(result.participant_results[index].duration_s for result in (outbound, inbound)) for index in range(2)]
    assert edge_maxima > max(person_totals)
    assert edge_maxima == sum(result.duration_s for result in (outbound, inbound))

    restrictive = evaluate_edge(team(("explorer_01",), ("support_rover",)), edge(16))
    assert not restrictive.allowed and "ascent_limit" in codes(restrictive)
    assert evaluate_edge(team(("explorer_01",)), edge(16)).allowed
    asymmetric = resolve_team(CATALOG, {"catalog_version": CATALOG.version, "humans": [{"profile_id": "explorer_01", "payload_kg": 0, "mission_overrides": {"max_ascent_deg": 5, "max_descent_deg": 15}}], "robots": []})
    assert "ascent_limit" in codes(evaluate_edge(asymmetric, edge(14)))
    assert evaluate_edge(asymmetric, edge(14).reversed()).allowed

    assert "missing_terrain" in codes(evaluate_edge(team(("explorer_01",)), edge(target=CellTerrain(None, 0))))
    assert "missing_elevation" in codes(evaluate_edge(team(("explorer_01",)), edge(target=CellTerrain("firm", None))))
    assert "invalid_elevation" in codes(evaluate_edge(team(("explorer_01",)), edge(target=CellTerrain("firm", math.nan))))
    assert "invalid_exclusion" in codes(evaluate_edge(team(("explorer_01",)), edge(target=CellTerrain("firm", 0, 0))))
    assert "excluded_cell" in codes(evaluate_edge(team(("explorer_01",)), edge(target=CellTerrain("firm", 0, True))))
    assert "invalid_rise" in codes(evaluate_edge(team(("explorer_01",)), edge(math.inf)))
    assert "invalid_run" in codes(evaluate_edge(team(("explorer_01",)), DirectedMetricEdge(CellTerrain("firm", 0), CellTerrain("firm", 0), True, 0)))
    print("directed movement checks passed")


if __name__ == "__main__":
    run()
