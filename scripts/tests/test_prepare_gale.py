"""Focused terrain-preparation checks using small analytical planes and missing data."""

import unittest

import numpy as np

from scripts.prepare_gale import summarize


class PreparationChecks(unittest.TestCase):
    def test_plane_preserves_native_values_and_centred_block_means(self):
        raw = (0.1*np.arange(8)[:, None] + 0.2*np.arange(8)[None, :]).astype(np.float32)
        original = raw.copy()
        result = summarize(raw, np.ones(raw.shape, bool), 1, 2)
        np.testing.assert_array_equal(raw, original)
        self.assertEqual(result["coverage"].shape, (3, 3))
        self.assertTrue(result["coverage"].all())
        self.assertAlmostEqual(result["elevation_m"][0, 0], float(raw[1:3, 1:3].mean()), places=6)
        np.testing.assert_allclose(result["terrain_slope_deg"], np.degrees(np.arctan(np.hypot(.1, .2))), atol=2e-5)

    def test_missing_halo_blocks_core_without_zero_filling(self):
        raw = np.ones((8, 8), np.float32)*-3300
        valid = np.ones(raw.shape, bool)
        valid[0, 1] = False
        raw[0, 1] = -3.4028226550889045e38
        result = summarize(raw, valid, 1, 2)
        self.assertFalse(result["coverage"][0, 0])
        self.assertTrue(np.isnan(result["elevation_m"][0, 0]))
        self.assertTrue(np.isnan(result["terrain_slope_deg"][0, 0]))
        self.assertTrue(result["coverage"][-1, -1])
        self.assertEqual(result["elevation_m"][-1, -1], -3300)

    def test_maximum_slope_retains_a_small_steep_feature(self):
        raw = np.zeros((8, 8), np.float32)
        raw[2, 2] = 2
        result = summarize(raw, np.ones(raw.shape, bool), 1, 2)
        self.assertGreater(result["terrain_slope_deg"][0, 0], 40)
        self.assertEqual(result["terrain_slope_deg"][-1, -1], 0)
        self.assertFalse(result["excluded"].any())


if __name__ == "__main__":
    unittest.main()
