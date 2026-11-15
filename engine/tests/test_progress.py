"""Simulated-progress reevaluation on a small synthetic searched grid."""

import math
import unittest

import numpy as np

from engine import CATALOG, MissionInputError, MissionTask, build_graph, resolve_team, routes_to, search_from_base
from engine.progress import SimulatedProgress, evaluate_progress
from engine.tests.test_grid import grid
from engine.tests.test_mission import AXIS, DAYLIGHT, SNAPSHOT
from engine import Departure


def setup(limit=5000):
    members = resolve_team(CATALOG, {"catalog_version": CATALOG.version, "humans": [
        {"profile_id": "explorer_01", "payload_kg": 0, "mission_overrides": {"max_sortie_s": limit}}], "robots": []})
    search = search_from_base(build_graph(grid(np.zeros((1, 6)), spacing_m=(10, 10)), members), (0, 0))
    return members, search, routes_to(search, (0, 5))


def run(progress, *, budget=5000, tasks=(MissionTask("sample", 100.0),), limit=5000):
    members, search, routes = setup(limit)
    return routes, evaluate_progress(routes, tasks, members, progress, search, time_budget_s=budget, reserve_s=50,
                                     departure=Departure(AXIS, 150.0), daylight=None, snapshot=SNAPSHOT)


class ProgressTests(unittest.TestCase):
    def test_outbound_without_delay_matches_plan_and_offers_return(self):
        routes, result = run(SimulatedProgress("outbound", 2, 0, 0))
        keep, back = result.options
        self.assertEqual([o.id for o in result.options], ["continue", "return_now"])
        edges = routes.outbound.edge_results
        self.assertAlmostEqual(result.elapsed_at_event_s, edges[0].duration_s + edges[1].duration_s)
        self.assertEqual(result.position_cell, (0, 2))
        # Continuing is the calculated sortie; returning now walks back from the current cell.
        self.assertAlmostEqual(keep.mission.elapsed_s, routes.outbound.duration_s + 100 + routes.return_leg.duration_s)
        self.assertEqual(back.routes.return_leg.cells[0], (0, 2))
        self.assertEqual(back.routes.return_leg.cells[-1], (0, 0))
        self.assertLess(back.mission.elapsed_s, keep.mission.elapsed_s)
        self.assertFalse(back.completes_tasks)

    def test_delay_is_added_without_resetting_limits(self):
        _, plain = run(SimulatedProgress("outbound", 3, 0, 0))
        _, late = run(SimulatedProgress("outbound", 3, 0, 600))
        self.assertAlmostEqual(late.options[0].mission.reserved_total_s, plain.options[0].mission.reserved_total_s + 600)
        self.assertAlmostEqual(late.options[0].mission.mission_margin_s, plain.options[0].mission.mission_margin_s - 600)
        self.assertAlmostEqual(late.elapsed_at_event_s, plain.elapsed_at_event_s + 600)

    def test_return_now_is_recommended_when_continuing_exceeds_the_budget(self):
        routes, base = run(SimulatedProgress("outbound", 1, 0, 0))
        budget = base.options[0].mission.reserved_total_s + 100
        _, result = run(SimulatedProgress("outbound", 1, 0, 300), budget=budget)
        keep, back = result.options
        self.assertTrue(any(c.rule_id == "mission_budget" and c.status == "failed" for c in keep.mission.checks))
        self.assertFalse(any(c.rule_id == "mission_budget" and c.status == "failed" for c in back.mission.checks))
        self.assertEqual(result.recommended, "return_now")

    def test_tasks_phase_and_return_phase(self):
        _, during = run(SimulatedProgress("tasks", 0, 40, 0))
        self.assertAlmostEqual(during.options[1].tasks[0].duration_s, 40)
        self.assertEqual(during.position_cell, (0, 5))
        _, back = run(SimulatedProgress("return", 2, 100, 0))
        self.assertEqual([o.id for o in back.options], ["continue"])
        self.assertEqual(back.recommended, "continue")

    def test_invalid_progress_is_rejected(self):
        for progress, code in ((SimulatedProgress("outbound", 9, 0, 0), "index_out_of_range"),
                               (SimulatedProgress("tasks", 0, 500, 0), "tasks_overrun"),
                               (SimulatedProgress("outbound", 1, 10, 0), "tasks_phase_mismatch"),
                               (SimulatedProgress("walking", 0, 0, 0), "invalid_phase"),
                               (SimulatedProgress("outbound", 1, 0, -5), "invalid_number"),
                               (SimulatedProgress("outbound", 1, 0, math.inf), "invalid_number")):
            with self.subTest(code=code), self.assertRaises(MissionInputError) as caught:
                run(progress)
            self.assertEqual(caught.exception.code, code)


if __name__ == "__main__":
    unittest.main()
