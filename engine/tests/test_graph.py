"""Compare every small-grid arc with independent scalar movement decisions."""

import math
import unittest
import numpy as np

from engine import CATALOG, GridInputError, evaluate_edge, resolve_team
from engine.graph import build_graph
from engine.tests.test_grid import grid
from engine.tests.test_movement import team


class GraphChecks(unittest.TestCase):
    def compare_scalar(self, value, members, block_cells=3):
        graph = build_graph(value, members, block_cells=block_cells)
        expected = {}
        for row in range(value.shape[0]):
            for col in range(value.shape[1]):
                source = (row, col)
                for dr in (-1, 0, 1):
                    for dc in (-1, 0, 1):
                        target = (row + dr, col + dc)
                        if not (dr or dc) or not (0 <= target[0] < value.shape[0] and 0 <= target[1] < value.shape[1]):
                            continue
                        result = evaluate_edge(members, graph.edge(source, target))
                        allowed = result.allowed
                        if dr and dc:
                            for side in ((row + dr, col), (row, col + dc)):
                                allowed &= evaluate_edge(members, graph.edge(source, side)).allowed
                                allowed &= evaluate_edge(members, graph.edge(side, target)).allowed
                        i, j = value.index(source), value.index(target)
                        actual = float(graph.csr[i, j])
                        self.assertEqual(actual > 0, allowed, (source, target))
                        if allowed:
                            self.assertTrue(math.isclose(actual, result.duration_s, rel_tol=1e-12, abs_tol=1e-9))
                            expected[(i, j)] = actual
        self.assertEqual(graph.csr.nnz, len(expected))
        self.assertTrue(np.all(graph.csr.data > 0))
        self.assertTrue(graph.csr.has_sorted_indices)
        return graph

    def test_flat_anisotropic_neighbors_and_single_cell(self):
        graph = self.compare_scalar(grid(), team(("explorer_01",)))
        self.assertAlmostEqual(graph.csr[0, 5], math.hypot(2, 3) / 0.4)
        self.assertEqual(graph.csr[3, 4], 0)  # No row wrapping.
        self.assertEqual(build_graph(grid([[0]]), team(("explorer_01",))).csr.nnz, 0)
        self.compare_scalar(grid([[0, 0, 0]]), team(("explorer_01",)))
        self.compare_scalar(grid([[0], [0], [0]]), team(("explorer_01",)))

    def test_masks_corners_and_terrain_gates(self):
        for mask_name in ("coverage", "excluded"):
            for side in ((0, 1), (1, 0)):
                mask = np.full((2, 2), mask_name == "coverage", dtype=bool)
                mask[side] = mask_name != "coverage"
                value = grid(np.zeros((2, 2)), **{mask_name: mask})
                graph = self.compare_scalar(value, team(("explorer_01",)))
                self.assertEqual(graph.csr[0, 3], 0)
                self.assertEqual(graph.csr[3, 0], 0)
        slope = np.array([[0., 9.], [0., 0.]])
        human = self.compare_scalar(grid(np.zeros((2, 2)), terrain_slope_deg=slope), team(("explorer_01",)))
        mixed = self.compare_scalar(grid(np.zeros((2, 2)), terrain_slope_deg=slope), team(("explorer_01",), ("support_rover",)))
        self.assertGreater(human.csr[0, 3], 0)
        self.assertEqual(mixed.csr[0, 3], 0)
        steep_side = self.compare_scalar(grid([[0, 100], [0, 0]]), team(("explorer_01",)))
        self.assertEqual(steep_side.csr[0, 3], 0)

    def test_random_scalar_parity_and_blocks(self):
        rng = np.random.default_rng(24)
        elevation = rng.uniform(-0.5, 0.5, (5, 7))
        coverage = rng.random((5, 7)) > 0.1
        excluded = rng.random((5, 7)) < 0.1
        elevation[~coverage] = -32768
        value = grid(elevation, coverage=coverage, excluded=excluded)
        for members in (team(("explorer_01", "explorer_02")), team(("explorer_01",), ("support_rover", "transport_rover"))):
            small = self.compare_scalar(value, members, block_cells=1)
            large = build_graph(value, members, block_cells=1000)
            self.assertEqual((small.csr != large.csr).nnz, 0)

    def test_directional_permissions_and_changing_limiting_participant(self):
        members = team(("explorer_01",), ("transport_rover",))
        graph = self.compare_scalar(grid([[0, 14, 0]], spacing_m=(100, 100)), members)
        results = [evaluate_edge(members, graph.edge((0, col), (0, col + 1))) for col in (0, 1)]
        self.assertEqual([result.limiting_participant_ids for result in results], [("explorer_01",), ("transport_rover",)])
        self.assertNotEqual(graph.csr[0, 1], graph.csr[1, 0])
        asymmetric = resolve_team(CATALOG, {"catalog_version": CATALOG.version, "humans": [{"profile_id": "explorer_01", "payload_kg": 0, "mission_overrides": {"max_ascent_deg": 5, "max_descent_deg": 15}}], "robots": []})
        graph = self.compare_scalar(grid([[0, 14]], spacing_m=(100, 100)), asymmetric)
        self.assertEqual(graph.csr[0, 1], 0)
        self.assertGreater(graph.csr[1, 0], 0)

    def test_invalid_construction(self):
        value = grid()
        for block in (0, -1, True, 1.5):
            with self.assertRaises(GridInputError):
                build_graph(value, team(("explorer_01",)), block_cells=block)
        with self.assertRaises(GridInputError):
            build_graph(value, ())

    def test_payload_does_not_introduce_a_speed_penalty(self):
        request = {"catalog_version": CATALOG.version, "humans": [{"profile_id": "explorer_01", "payload_kg": 10}], "robots": []}
        loaded = build_graph(grid(), resolve_team(CATALOG, request))
        unloaded = build_graph(grid(), team(("explorer_01",)))
        self.assertEqual((loaded.csr != unloaded.csr).nnz, 0)


if __name__ == "__main__":
    unittest.main()
