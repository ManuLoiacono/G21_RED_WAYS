"""Area HTTP identity, bounded encoding and movement-context reuse."""

import base64
from copy import deepcopy
import json
from pathlib import Path
import unittest
import numpy as np

from engine.reachability import unpack_states
from service.example import example_requests
from service.planning import PreparedPlanner
from service.prepared import fixture_registry
from service.reachability import reachable_area
from service.http_server import encode_bounded, MAX_RESPONSE_BYTES
from service.tests.test_http import serving, request


class ReachabilityServiceTests(unittest.TestCase):
    def test_http_reuse_missing_and_height_preference_independence(self):
        payload = example_requests()["baseline"]
        planner = PreparedPlanner(fixture_registry())
        first = reachable_area(planner, payload)
        changed = deepcopy(payload)
        changed["options"] = {"communication": {"base_height_m": 10, "receiver_height_m": 1}}
        second = reachable_area(planner, changed)
        self.assertEqual(first["data"], second["data"])
        changed["mission"]["tasks"][0]["duration_s"] += 1
        third = reachable_area(planner, changed)
        self.assertTrue(third["movement_reuse"]["base_search"])
        self.assertNotEqual(first["id"], third["id"])
        with serving() as server:
            status, _, response = request(server, "POST", "/reachable-area", json.dumps(payload), {"Content-Type": "application/json"})
            self.assertEqual(status, 200); self.assertEqual(response["request_echo"], payload)
            self.assertEqual(sum(response["counts"].values()), 9)
        missing = reachable_area(planner, example_requests()["missing_daylight"])
        self.assertEqual(missing["counts"]["5"], 0)
        self.assertGreater(missing["counts"]["4"], 0)

    def test_real_grid_bounded_complete_and_reusable(self):
        from service.gale import gale_registry
        manifest = Path("data/processed/gale/analytical/manifest.json")
        if not (manifest.parent / "terrain.npz").exists():
            self.skipTest("Verified real archive unavailable; run prepare_gale --factor 2.")
        planner = PreparedPlanner(gale_registry(manifest))
        payload = json.loads(Path("service/examples/gale-replay.request.json").read_text())
        result = reachable_area(planner, payload)
        states = unpack_states(base64.b64decode(result["data"]), result["grid"]["shape"])
        self.assertEqual(states.size, 2140369)
        self.assertEqual(sum(result["counts"].values()), states.size)
        self.assertGreater(result["counts"]["5"], 0)
        self.assertLess(len(encode_bounded(result)), MAX_RESPONSE_BYTES)
        payload["mission"]["tasks"][0]["duration_s"] += 1000
        changed = reachable_area(planner, payload)
        self.assertTrue(changed["movement_reuse"]["graph"] and changed["movement_reuse"]["base_search"])
        larger = unpack_states(base64.b64decode(changed["data"]), states.shape)
        self.assertTrue(np.all((larger != 5) | (states == 5)))


if __name__ == "__main__":
    unittest.main()
