"""Tests for horizon_profile.py's horizon maths and its "cut off at data edge" flags, with a
made-up map only (no real file). Run: python -m unittest scripts/data/test_horizon_profile.py
"""
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import horizon_profile as hp  # noqa: E402


class FakeDem:
    """A made-up flat map (height 0 m) on the same south polar stereographic grid as the real one,
    `half_width_m` either side of the pole, so rays leave it where it ends."""

    def __init__(self, half_width_m, pixel_size=2000.0):
        self.pixel_size = pixel_size
        self.width = self.height = int(2 * half_width_m / pixel_size)
        self.x0 = -half_width_m
        self.y0 = half_width_m
        self.z = np.zeros((self.height, self.width), dtype='<f4')

    pixel = hp.Dem.pixel
    sample = hp.Dem.sample


class Horizon(unittest.TestCase):
    def test_flat_ground_sits_below_the_level_line_and_reaches_full_distance(self):
        # 600 km either side of the pole; a site 1° from the pole sees 250 km of terrain all round.
        dem = FakeDem(600_000)
        h0, elevations, cut, radius = hp.horizon(dem, -89.0, 0.0)
        self.assertAlmostEqual(h0, 0.0)
        self.assertEqual(len(elevations), 360)
        # Flat ground on a sphere falls away: every direction's highest point is just below 0°.
        self.assertTrue(all(-0.1 < e < 0 for e in elevations))
        self.assertEqual(sum(cut), 0)
        self.assertGreaterEqual(radius, hp.MAX_DISTANCE_M)

    def test_rays_that_leave_the_map_early_are_flagged_and_the_others_are_not(self):
        # A map 300 km either side of the pole, the site 100 km from the pole at longitude 0 (like
        # im1 near the real map's edge). Heading north (away from the pole) the ray reaches 350 km
        # from the pole and runs off the map; heading south it crosses the pole and stays on it.
        dem = FakeDem(300_000)
        lat = -90 + 100_000 / hp.R * 180 / np.pi
        _, elevations, cut, radius = hp.horizon(dem, lat, 0.0)
        self.assertEqual(len(cut), 360)
        self.assertTrue(set(cut) <= {0, 1})
        self.assertEqual(cut[0], 1)
        self.assertEqual(cut[180], 0)
        self.assertTrue(0 < sum(cut) < 360)
        self.assertLess(radius, hp.MAX_DISTANCE_M)


if __name__ == '__main__':
    unittest.main()
