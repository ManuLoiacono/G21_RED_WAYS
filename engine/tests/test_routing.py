"""Known paths, asymmetric returns, endpoint errors and guarded predecessors."""

from dataclasses import replace
import math
import unittest
from unittest.mock import patch

import numpy as np
from scipy.sparse.csgraph import dijkstra

from engine import CATALOG, GridInputError, resolve_team
from engine.graph import build_graph
from engine.routing import RouteReconstructionError, reconstruct_route, routes_to, search_from_base
from engine.tests.test_grid import grid
from engine.tests.test_movement import team


def asymmetric_team():
    return resolve_team(CATALOG, {"catalog_version": CATALOG.version, "humans": [{"profile_id": "explorer_01", "payload_kg": 0,
                         "mission_overrides": {"max_ascent_deg": 15, "max_descent_deg": 5}}], "robots": []})


class RoutingChecks(unittest.TestCase):
    def search(self, value, members=None, base=(0, 0)):
        return search_from_base(build_graph(value, members or team(("explorer_01",))), base)

    def assert_original_edges_and_cost(self, search, result):
        graph = search.graph
        self.assertEqual(result.status, "found")
        weights = [float(graph.csr[graph.grid.index(source), graph.grid.index(target)]) for source, target in zip(result.cells, result.cells[1:])]
        self.assertTrue(all(weight > 0 for weight in weights))
        self.assertTrue(math.isclose(math.fsum(weights), result.duration_s, rel_tol=1e-9, abs_tol=1e-6))
        self.assertTrue(math.isclose(math.fsum(value.duration_s for value in result.edge_results), result.search_cost_s, rel_tol=1e-9, abs_tol=1e-6))

    def test_known_flat_shortest_path_and_same_cell(self):
        search = self.search(grid(np.zeros((3, 3)), spacing_m=(2, 2)))
        result = routes_to(search, (2, 2))
        self.assertEqual(search.outbound_cost_s.shape, (9,))
        self.assertEqual(result.outbound.cells, ((0, 0), (1, 1), (2, 2)))
        self.assertAlmostEqual(result.outbound.horizontal_distance_m, 4 * math.sqrt(2))
        self.assertAlmostEqual(result.outbound.duration_s, 10 * math.sqrt(2))
        self.assertEqual(result.return_leg.cells, tuple(reversed(result.outbound.cells)))
        self.assertEqual(result.outbound.ascent_m, 0)
        self.assertIn("mission_budget", result.not_evaluated)
        for leg in (result.outbound, result.return_leg):
            self.assert_original_edges_and_cost(search, leg)
        same = routes_to(search, (0, 0))
        for leg in (same.outbound, same.return_leg):
            self.assertEqual((leg.status, leg.cells, leg.duration_s, leg.horizontal_distance_m), ("found", ((0, 0),), 0, 0))
            self.assertEqual(leg.edge_results, ())

    def test_barrier_and_one_cell_opening(self):
        excluded = np.zeros((5, 5), dtype=bool)
        excluded[:, 2] = True
        value = grid(np.zeros((5, 5)), excluded=excluded)
        closed = routes_to(self.search(value, base=(2, 0)), (2, 4))
        for leg in (closed.outbound, closed.return_leg):
            self.assertEqual(leg.status, "no_path_in_domain")
            self.assertIsNone(leg.duration_s)
            self.assertEqual(leg.cells, ())
        excluded[2, 2] = False
        search = self.search(grid(np.zeros((5, 5)), excluded=excluded), base=(2, 0))
        opened = routes_to(search, (2, 4))
        self.assertIn((2, 2), opened.outbound.cells)
        for leg in (opened.outbound, opened.return_leg):
            self.assert_original_edges_and_cost(search, leg)

    def test_two_missing_or_excluded_sides_do_not_connect_diagonal(self):
        for coverage, excluded in ((np.array([[True, False], [False, True]]), np.zeros((2, 2), dtype=bool)),
                                   (np.ones((2, 2), dtype=bool), np.array([[False, True], [True, False]]))):
            result = routes_to(self.search(grid(np.zeros((2, 2)), coverage=coverage, excluded=excluded)), (1, 1))
            self.assertEqual(result.outbound.status, "no_path_in_domain")

    def test_outbound_without_return(self):
        search = self.search(grid([[0, 14]], spacing_m=(100, 100)), asymmetric_team())
        result = routes_to(search, (0, 1))
        self.assertEqual(result.outbound.status, "found")
        self.assertEqual(result.return_leg.status, "no_path_in_domain")
        self.assertEqual(result.outbound.ascent_m, 14)
        self.assert_original_edges_and_cost(search, result.outbound)

    def test_best_return_uses_different_geometry(self):
        search = self.search(grid([[7, 14, 21], [0, 14, 28]], spacing_m=(100, 100)), asymmetric_team(), base=(1, 0))
        result = routes_to(search, (1, 2))
        self.assertEqual(result.outbound.cells, ((1, 0), (1, 1), (1, 2)))
        self.assertEqual(result.return_leg.cells, ((1, 2), (0, 2), (0, 1), (0, 0), (1, 0)))
        self.assertNotEqual(result.return_leg.cells, tuple(reversed(result.outbound.cells)))
        self.assertEqual(result.return_leg.descent_m, 28)
        self.assertNotEqual(result.outbound.duration_s, result.return_leg.duration_s)
        for leg in (result.outbound, result.return_leg):
            self.assert_original_edges_and_cost(search, leg)

    def test_changing_team_changes_duration_or_connectivity(self):
        value = grid([[0, 0, 0]])
        slow = routes_to(self.search(value, team(("explorer_01",))), (0, 2)).outbound
        fast = routes_to(self.search(value, team(("explorer_02",))), (0, 2)).outbound
        self.assertEqual(slow.cells, fast.cells)
        self.assertLess(fast.duration_s, slow.duration_s)
        grade = grid([[0, 16]], spacing_m=(100, 100))
        self.assertEqual(routes_to(self.search(grade), (0, 1)).outbound.status, "found")
        restrictive = self.search(grade, team(("explorer_01",), ("support_rover",)))
        self.assertEqual(routes_to(restrictive, (0, 1)).outbound.status, "no_path_in_domain")

    def test_route_sums_edge_maxima_with_changing_limiting_participant(self):
        search = self.search(grid([[0, 14, 0]], spacing_m=(100, 100)), team(("explorer_01",), ("transport_rover",)))
        leg = routes_to(search, (0, 2)).outbound
        self.assertEqual([edge.limiting_participant_ids for edge in leg.edge_results], [("explorer_01",), ("transport_rover",)])
        participant_totals = [sum(edge.participant_results[index].duration_s for edge in leg.edge_results) for index in range(2)]
        self.assertGreater(leg.duration_s, max(participant_totals))
        self.assert_original_edges_and_cost(search, leg)

    def test_return_costs_match_independent_forward_searches(self):
        rng = np.random.default_rng(12)
        value = grid(rng.uniform(-0.3, 0.3, (4, 5)))
        search = self.search(value, asymmetric_team())
        for row in range(4):
            for col in range(5):
                cell = (row, col)
                expected = dijkstra(search.graph.csr, directed=True, indices=value.index(cell))[search.base_index]
                actual = reconstruct_route(search, cell, leg="return")
                if math.isinf(expected):
                    self.assertEqual(actual.status, "no_path_in_domain")
                else:
                    self.assertAlmostEqual(actual.duration_s, expected)
                    self.assert_original_edges_and_cost(search, actual)

    def test_invalid_missing_excluded_and_summary_endpoints(self):
        cases = [
            (dict(coverage=np.array([[False, True]])), "missing_endpoint_coverage"),
            (dict(excluded=np.array([[True, False]])), "excluded_endpoint"),
            (dict(terrain_slope_deg=np.array([[30., 0.]])), "endpoint_terrain_limit"),
        ]
        for overrides, code in cases:
            graph = build_graph(grid([[-32768, 0]] if "coverage" in overrides else [[0, 0]], **overrides), team(("explorer_01",)))
            with self.assertRaises(GridInputError) as error:
                search_from_base(graph, (0, 0))
            self.assertEqual((error.exception.code, error.exception.path), (code, "base"))
            search = search_from_base(graph, (0, 1))
            with self.assertRaises(GridInputError) as error:
                routes_to(search, (0, 0))
            self.assertEqual((error.exception.code, error.exception.path), (code, "destination"))
        graph = build_graph(grid(), team(("explorer_01",)))
        for cell in ((-1, 0), (99, 0), (True, 0), (1.1, 0)):
            with self.assertRaises(GridInputError):
                search_from_base(graph, cell)

    def test_interrupted_search_is_not_disconnection(self):
        graph = build_graph(grid([[0, 0]]), team(("explorer_01",)))
        complete = search_from_base(graph, (0, 0))
        for side_effect in (KeyboardInterrupt, [(complete.outbound_cost_s, complete.outbound_predecessors), KeyboardInterrupt]):
            with patch("engine.routing.dijkstra", side_effect=side_effect):
                interrupted = search_from_base(graph, (0, 0))
            self.assertEqual(interrupted.status, "search_inconclusive")
            self.assertIsNone(interrupted.outbound_cost_s)
            self.assertIsNone(interrupted.return_cost_s)
            self.assertEqual(routes_to(interrupted, (0, 1)).return_leg.status, "search_inconclusive")

    def test_corrupt_predecessors_and_costs_are_technical_errors(self):
        search = self.search(grid([[0, 0, 0]]))
        for predecessor in (-9999, 3, 2):
            pred = search.outbound_predecessors.copy()
            pred[2] = predecessor
            with self.assertRaises(RouteReconstructionError):
                reconstruct_route(replace(search, outbound_predecessors=pred), (0, 2))
        cost = search.outbound_cost_s.copy()
        cost[2] += 10
        with self.assertRaises(RouteReconstructionError):
            reconstruct_route(replace(search, outbound_cost_s=cost), (0, 2))
        pred = search.outbound_predecessors.copy()
        pred[2] = 0  # In-bounds, but skips a neighbor in the original graph.
        with self.assertRaises(RouteReconstructionError):
            reconstruct_route(replace(search, outbound_predecessors=pred), (0, 2))


if __name__ == "__main__":
    unittest.main()
