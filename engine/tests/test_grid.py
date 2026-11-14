"""Metric boundary checks independent of any raster file or geographic adapter."""

import unittest
import numpy as np

from engine import GridInputError, MetricGrid, DirectedMetricEdge, evaluate_edge
from engine.tests.test_movement import team


def grid(elevation=None, **overrides):
    elevation = np.zeros((3, 4)) if elevation is None else np.asarray(elevation)
    values = dict(elevation_m=elevation, coverage=np.ones(elevation.shape, dtype=bool),
                  excluded=np.zeros(elevation.shape, dtype=bool), spacing_m=(2, 3),
                  origin_center_xy_m=(10, 20), row_direction="decreasing_y",
                  data_version="synthetic-grid-v1", aggregation_policy="Synthetic cells; masks apply to whole cells.", fixture=True)
    values.update(overrides)
    return MetricGrid(**values)


class GridChecks(unittest.TestCase):
    def test_numpy_scalars_and_snapshot(self):
        elevation = np.zeros((2, 3), dtype=np.float32)
        value = grid(elevation, spacing_m=(np.float32(2), np.int64(3)))
        elevation[0, 0] = 900
        self.assertEqual(value.cell((np.int64(0), 0)).elevation_m, 0)
        self.assertEqual(value.xy_m((1, 2)), (16, 18))
        self.assertFalse(value.elevation_m.flags.writeable)
        movement = DirectedMetricEdge(value.cell((0, 0)), value.cell((0, 1)), np.float32(3), np.int64(0))
        self.assertTrue(evaluate_edge(team(("explorer_01",)), movement).allowed)

    def test_masks_are_authoritative(self):
        coverage = np.array([[True, False]])
        for nodata in (-32768, np.nan, np.inf):
            value = grid([[0, nodata]], coverage=coverage)
            self.assertFalse(value.cell((0, 1)).coverage_valid)
        self.assertTrue(grid([[0]], excluded=np.ones((1, 1), dtype=bool)).cell((0, 0)).excluded)

    def test_malformed_inputs(self):
        cases = [
            dict(elevation_m=[[0]]), dict(elevation_m=np.zeros(3)), dict(elevation_m=np.empty((0, 2))),
            dict(elevation_m=np.array([[True]])), dict(elevation_m=np.array([[1j]])),
            dict(coverage=np.ones((3, 4), dtype=np.uint8)), dict(excluded=np.zeros((1, 4), dtype=bool)),
            dict(spacing_m=(0, 2)), dict(spacing_m=(True, 2)), dict(spacing_m=(np.nan, 2)),
            dict(spacing_m=(np.inf, 2)), dict(spacing_m=(2,)), dict(origin_center_xy_m=(0, np.inf)),
            dict(row_direction="north"), dict(data_version=""), dict(aggregation_policy=" "), dict(fixture=1),
            dict(elevation_m=np.full((3, 4), np.nan)), dict(terrain_slope_deg=np.zeros((1, 1))),
            dict(terrain_slope_deg=np.full((3, 4), 90)), dict(terrain_slope_deg=np.full((3, 4), np.nan)),
            dict(fixture=False),
        ]
        for case in cases:
            with self.subTest(case=case), self.assertRaises(GridInputError) as error:
                grid(**case)
            self.assertTrue(error.exception.code)
            self.assertTrue(error.exception.path.startswith("grid."))
        value = grid()
        for cell in ((-1, 0), (0, 4), (True, 0), (1.5, 0), (0,), None):
            with self.subTest(cell=cell), self.assertRaises(GridInputError):
                value.index(cell)

    def test_real_input_requires_summary_but_does_not_validate_model(self):
        value = grid(fixture=False, terrain_slope_deg=np.zeros((3, 4)))
        self.assertFalse(value.fixture)
        self.assertIsNone(value.cell((0, 0)).terrain_code)


if __name__ == "__main__":
    unittest.main()
