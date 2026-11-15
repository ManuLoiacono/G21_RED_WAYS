"""Exhaustive tiny-graph reference for distinct lexicographic objectives."""

import math
import unittest
import numpy as np

from engine import CATALOG, MetricGrid, build_graph, resolve_team, routes_to, search_from_base
from engine.comparison import search_criterion, criterion_weights


class ComparisonTests(unittest.TestCase):
    def graph(self, flat=False):
        z = np.zeros((3, 3)); z[0, 1] = 0 if flat else 2
        grid = MetricGrid(z, np.ones(z.shape, bool), np.zeros(z.shape, bool), (10, 10), (0, 0), "increasing_y", "tiny", "native", True)
        team = resolve_team(CATALOG, {"catalog_version": CATALOG.version, "humans": [{"profile_id": "explorer_01", "payload_kg": 0,
                "mission_overrides": {"flat_speed_m_s": 1, "max_ascent_deg": 89, "max_descent_deg": 89}}], "robots": []})
        return build_graph(grid, team)

    def exhaustive(self, graph, primary, start, target):
        best = (math.inf, math.inf)
        def visit(node, seen, score, time):
            nonlocal best
            if node == target:
                best = min(best, (score, time)); return
            for edge in range(graph.csr.indptr[node], graph.csr.indptr[node + 1]):
                other = int(graph.csr.indices[edge])
                if other not in seen:
                    visit(other, seen | {other}, score + primary[edge], time + graph.csr.data[edge])
        visit(start, {start}, 0, 0)
        return best

    def test_distinct_optima_match_independent_enumeration(self):
        graph = self.graph()
        states = np.ones((3, 3), dtype=np.uint8); states[0, 1] = 2; states[1, 1] = 0
        paths = [routes_to(search_from_base(graph, (0, 0)), (0, 2)).outbound.cells]
        for criterion in ("lowest_relative_effort", "best_geometric_visibility"):
            search = search_criterion(graph, (0, 0), criterion, states)
            routes = routes_to(search, (0, 2))
            primary = criterion_weights(graph, criterion, states)
            for route, source, target in ((routes.outbound, 0, 2), (routes.return_leg, 2, 0)):
                expected_score, expected_time = self.exhaustive(graph, primary, source, target)
                score = 0
                for a, b in zip(route.cells, route.cells[1:]):
                    i, j = graph.grid.index(a), graph.grid.index(b)
                    edges = range(graph.csr.indptr[i], graph.csr.indptr[i + 1])
                    edge = next(k for k in edges if graph.csr.indices[k] == j)
                    score += primary[edge]
                self.assertAlmostEqual(score, expected_score)
                self.assertAlmostEqual(route.duration_s, expected_time)
                self.assertAlmostEqual(route.search_cost_s, expected_time)
            paths.append(routes.outbound.cells)
        self.assertEqual(len(set(paths)), 3)

    def test_zero_primary_edges_and_time_tie_break(self):
        graph = self.graph(flat=True)
        for criterion in ("lowest_relative_effort", "best_geometric_visibility"):
            routes = routes_to(search_criterion(graph, (0, 0), criterion, np.ones((3, 3))), (0, 2))
            self.assertEqual(routes.outbound.duration_s, 20)
            self.assertEqual(routes.return_leg.duration_s, 20)
            self.assertEqual(routes.outbound.ascent_m, 0)


if __name__ == "__main__":
    unittest.main()
