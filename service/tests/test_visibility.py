"""Independent flat/ridge/gap and physical exposure acceptance cases."""

from dataclasses import replace
import math
import unittest

import numpy as np

from engine import MetricGrid, build_graph, routes_to, search_from_base, resolve_team, CATALOG
from engine.communication import communication_metrics
from service.prepared import fixture_registry
from service.planning import PreparedPlanner
from service.validation import PlanningInputError
from service.visibility import prepare_visibility, settings


def parcel(elev, coverage=None):
    elevation = np.asarray(elev, dtype=float)
    grid = MetricGrid(elevation, np.ones(elevation.shape, dtype=bool) if coverage is None else coverage,
                      np.zeros(elevation.shape, dtype=bool), (10, 10), (0, 0), "increasing_y", "test", "native", True)
    return replace(fixture_registry().parcels[0], grid=grid, content_id=str(elevation.tolist()) + str(coverage))


class VisibilityTests(unittest.TestCase):
    def test_http_options_echo_and_validation(self):
        import json
        from service.tests.test_http import serving, post_plan
        from service.example import example_requests
        request = example_requests()["baseline"]
        request["options"] = {"visibility": True, "communication": {"base_height_m": 5, "receiver_height_m": 2}}
        with serving() as server:
            status, _, response = post_plan(server, request)
            self.assertEqual(status, 200)
            self.assertEqual(response["request_echo"], request)
            self.assertEqual(response["alternatives"][0]["metrics"]["elapsed_s"], 800)
            self.assertEqual(response["alternatives"][0]["communication"]["status"], "evaluated")
            request["options"]["communication"]["base_height_m"] = -1
            self.assertEqual(post_plan(server, request)[0], 422)

    def test_flat_and_curvature_reference(self):
        p = parcel(np.zeros((7, 7)))
        self.assertTrue(np.all(prepare_visibility(p, (3, 3)).states == 1))
        # Along an axis, independent line-of-sight samples check the adopted
        # curvature convention and endpoint geometry, without calling GDAL.
        p = parcel(np.zeros((1, 8)))
        p = replace(p, grid=replace(p.grid, spacing_m=(1000, 1000)))
        state = prepare_visibility(p, (0, 0)).states[0]
        for target in range(1, 8):
            distance = target * 1000
            target_z = 2 - distance ** 2 / (2 * 3396190)
            clear = all(- (i * 1000) ** 2 / (2 * 3396190) <= 5 + (target_z - 5) * i / target
                        for i in range(1, target))
            self.assertEqual(state[target] == 1, clear)

    def test_ridge_gap_and_heights(self):
        p = parcel([[0, 0, 20, 0, 0, 0, 0]])
        layer = prepare_visibility(p, (0, 0))
        self.assertEqual(layer.states[0, 6], 2)
        self.assertEqual(prepare_visibility(p, (0, 0), {"base_height_m": 100}).states[0, 6], 1)
        gap = np.ones((1, 7), dtype=bool); gap[0, 2] = False
        missing = prepare_visibility(parcel([[0] * 7], gap), (0, 0))
        self.assertEqual(missing.states[0, 2], 0)
        self.assertEqual(missing.states[0, 6], 0)
        # A verified ridge may still establish occlusion beyond missing terrain.
        ridge_gap = parcel([[0, 20, 0, 0, 0, 0, 0]], gap)
        self.assertEqual(prepare_visibility(ridge_gap, (0, 0)).states[0, 6], 2)

    def test_cache_identity_and_validation(self):
        planner = PreparedPlanner(fixture_registry())
        p = parcel([[0] * 7])
        first = planner.visibility(p, (0, 0))
        self.assertIs(first, planner.visibility(p, (0, 0)))
        self.assertNotEqual(first.id, planner.visibility(p, (0, 1)).id)
        self.assertNotEqual(first.id, planner.visibility(p, (0, 0), {"receiver_height_m": 3}).id)
        self.assertNotEqual(first.id, planner.visibility(parcel([[0, 0, 1, 0, 0, 0, 0]]), (0, 0)).id)
        for value in (-1, math.nan, math.inf, True):
            with self.assertRaises(PlanningInputError):
                settings({"base_height_m": value})

    def test_half_edges_tasks_and_interruption_do_not_reset_at_legs(self):
        p = parcel([[0, 0, 0]])
        team = resolve_team(CATALOG, {"catalog_version": CATALOG.version,
                            "humans": [{"profile_id": "explorer_01", "payload_kg": 0}], "robots": []})
        routes = routes_to(search_from_base(build_graph(p.grid, team), (0, 0)), (0, 2))
        states = np.array([[1, 2, 0]], dtype=np.uint8)
        metrics = communication_metrics(routes, states, 60)
        travel = routes.outbound.duration_s + routes.return_leg.duration_s
        self.assertAlmostEqual(sum(metrics[k] for k in ("visible_s", "unknown_s", "occluded_s")), travel + 60)
        self.assertAlmostEqual(metrics["max_without_confirmed_s"], travel * 3 / 4 + 60)
        self.assertEqual(metrics["reserve_exposure_s"], 0)
        self.assertGreater(metrics["unknown_s"], 60)


if __name__ == "__main__":
    unittest.main()
