"""Independent per-cell mission agreement, directionality and compact statuses."""

from dataclasses import replace
import unittest
import numpy as np

from engine import build_graph, search_from_base, routes_to, evaluate_mission, MissionTask, Departure
from engine.reachability import reachable_states, pack_states, unpack_states
from engine.tests.test_grid import grid
from engine.tests.test_mission import team, AXIS, DAYLIGHT, SNAPSHOT
from engine.tests.test_routing import asymmetric_team


class ReachabilityTests(unittest.TestCase):
    def context(self):
        covered = np.ones((4, 4), bool); covered[3, 3] = False
        excluded = np.zeros((4, 4), bool); excluded[1, 1] = True
        value = grid(np.zeros((4, 4)), spacing_m=(10, 10), coverage=covered, excluded=excluded)
        graph = build_graph(value, team())
        return graph, search_from_base(graph, (0, 0))

    def settings(self):
        return dict(tasks_s=20, reserve_s=10, time_budget_s=160, participants=team(),
                    departure=Departure(AXIS, 100), daylight=DAYLIGHT)

    def test_independent_per_cell_agreement_and_barriers(self):
        graph, search = self.context(); settings = self.settings()
        states = reachable_states(graph, search, **settings)
        self.assertEqual(states[3, 3], 0); self.assertEqual(states[1, 1], 1)
        for row, col in np.ndindex(states.shape):
            if not graph.traversable[graph.grid.index((row, col))]:
                continue
            mission = evaluate_mission(routes_to(search, (row, col)), (MissionTask("task", 20),), team(),
                time_budget_s=160, reserve_s=10, departure=settings["departure"], daylight=DAYLIGHT, snapshot=SNAPSHOT)
            self.assertEqual(states[row, col] == 5, mission.assessment == "viable_model")

    def test_monotonic_tasks_reserve_budget_and_missing_evidence(self):
        graph, search = self.context(); settings = self.settings()
        before = reachable_states(graph, search, **settings)
        for changes in ({"tasks_s": 21}, {"reserve_s": 11}, {"time_budget_s": 159}):
            after = reachable_states(graph, search, **{**settings, **changes})
            self.assertTrue(np.all((after != 5) | (before == 5)))
        missing = reachable_states(graph, search, **{**settings, "daylight": None})
        self.assertEqual(np.count_nonzero(missing == 5), 0)
        self.assertEqual(np.count_nonzero(missing == 4), np.count_nonzero(before == 5))
        failed_departure = reachable_states(graph, search, **{**settings, "departure": Departure(AXIS, 99)})
        self.assertEqual(np.count_nonzero(failed_departure == 5), 0)
        incomplete = reachable_states(graph, None, **settings)
        self.assertEqual(np.count_nonzero(incomplete == 5), 0)
        self.assertTrue(np.any(incomplete == 6))

    def test_equality_and_directed_return_failure(self):
        graph = build_graph(grid([[0, 0, 0]], spacing_m=(10, 10)), team())
        search = search_from_base(graph, (0, 0)); settings = self.settings()
        exact = search.outbound_cost_s[2] + search.return_cost_s[2] + 30
        settings.update(time_budget_s=exact, daylight=replace(DAYLIGHT, end_s=100 + exact))
        self.assertEqual(reachable_states(graph, search, **settings)[0, 2], 5)
        self.assertEqual(reachable_states(graph, search, **{**settings, "tasks_s": 21})[0, 2], 3)
        graph = build_graph(grid([[0, 14, 0]], spacing_m=(100, 100)), asymmetric_team())
        search = search_from_base(graph, (0, 0))
        self.assertTrue(np.isfinite(search.outbound_cost_s[1]))
        self.assertFalse(np.isfinite(search.return_cost_s[1]))
        self.assertEqual(reachable_states(graph, search, **{**self.settings(), "participants": asymmetric_team()})[0, 1], 2)

    def test_encoding_round_trip_and_padding(self):
        states = np.arange(15, dtype=np.uint8).reshape(3, 5) % 7
        packed = pack_states(states)
        self.assertEqual(len(packed), 8)
        np.testing.assert_array_equal(unpack_states(packed, states.shape), states)
        with self.assertRaises(ValueError):
            unpack_states(packed[:-1], states.shape)
        with self.assertRaises(ValueError):
            unpack_states(packed[:-1] + bytes([packed[-1] | 0xF0]), states.shape)


if __name__ == "__main__":
    unittest.main()
