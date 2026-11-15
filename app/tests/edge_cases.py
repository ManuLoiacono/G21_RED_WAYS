"""Emit calculated HTTP edge cases for frontend contract regression checks."""
import json
from unittest.mock import patch

from engine import RoutingSearch
from service.example import example_requests
from service.http_server import HTTPApplication
from service.prepared import registry_from_fixture
from service.tests.test_http import post_plan, serving
from service.tests.test_prepared import raw_fixture

raw = raw_fixture()
raw["parcel"]["grid"].update(
    elevation_m=[[0, 14]], coverage=[[True, True]], excluded=[[False, False]],
    terrain_slope_deg=[[0, 0]], spacing_m=[100, 100],
    aggregation_policy="Synthetic directed-grade case; exact covered centers and no exclusions.",
)
raw["parcel"]["pois"] = [{"id": "base", "xy_m": [0, 0]}, {"id": "sample", "xy_m": [100, 0]}]
payload = example_requests()["baseline"]
payload["destination"] = {"type": "poi", "poi_id": "sample"}
payload["team"]["robots"] = []
payload["team"]["humans"][0]["mission_overrides"] = {"max_ascent_deg": 15, "max_descent_deg": 5}
with serving(HTTPApplication(registry=registry_from_fixture(raw))) as server:
    status, _, no_return = post_plan(server, payload)
    assert status == 200


def interrupted(graph, base):
    return RoutingSearch(graph, graph.grid.index(base), "search_inconclusive", "Synthetic interrupted search")


with serving() as server, patch("service.planning.search_from_base", side_effect=interrupted):
    status, _, inconclusive = post_plan(server, example_requests()["baseline"])
    assert status == 200
print(json.dumps({"no_return": no_return, "inconclusive": inconclusive}, allow_nan=False))
