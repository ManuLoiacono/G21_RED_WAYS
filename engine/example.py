"""Reproducible synthetic two-direction team movement example."""

from dataclasses import asdict
import json

from . import CATALOG, CellTerrain, DirectedMetricEdge, evaluate_path, resolve_team


def main():
    request = {
        "catalog_version": CATALOG.version,
        "humans": [{"profile_id": "explorer_01", "payload_kg": 4.0, "mission_overrides": {}}],
        "robots": [{"profile_id": "transport_rover", "payload_kg": 12.0, "mission_overrides": {}}],
    }
    team = resolve_team(CATALOG, request)
    low = CellTerrain("firm", 0.0)
    high = CellTerrain("firm", 14.0)
    uphill = DirectedMetricEdge(low, high, run_m=100.0, rise_m=14.0)
    results = evaluate_path(team, (uphill, uphill.reversed()))
    output = {
        "fixture": True,
        "input": {"team": request, "edges": [asdict(uphill), asdict(uphill.reversed())]},
        "edge_results": [asdict(result) for result in results],
        "group_path_duration_s": sum(result.duration_s for result in results),
        "not_evaluated": ["route search", "mission budget", "load-to-speed effect", "real Mars capability"],
    }
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
