"""Tests for recolor_visibility.py with made-up values only.
Run: python -m unittest scripts/data/test_recolor_visibility.py
"""
import json
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import recolor_visibility as rv  # noqa: E402

PALETTE = json.loads(rv.PALETTE.read_text(encoding='utf-8'))


class Styled(unittest.TestCase):
    def test_zero_is_transparent_and_opacity_rises_with_the_value(self):
        values = np.array([0.0, 1 / 128, 0.5, 1.0])
        rgba = rv.styled_rgba(values, 'sun', PALETTE)
        self.assertEqual(rgba[0, 3], 0)
        self.assertEqual(rgba[1, 3], round((0.3 + 0.7 / 128) * 255))
        self.assertEqual(rgba[3, 3], 255)
        self.assertTrue(rgba[1, 3] < rgba[2, 3] < rgba[3, 3])

    def test_each_target_uses_its_own_palette_ends(self):
        sun = rv.styled_rgba(np.array([0.0, 0.5, 1.0]), 'sun', PALETTE)
        earth = rv.styled_rgba(np.array([0.0, 0.5, 1.0]), 'earth', PALETTE)
        self.assertEqual(list(sun[2, :3]), rv.hex_rgb('#ffd84d'))
        self.assertEqual(list(sun[1, :3]), rv.hex_rgb('#ff8a00'))
        self.assertEqual(list(earth[2, :3]), rv.hex_rgb('#d6f2ff'))
        self.assertEqual(list(earth[0, :3]), rv.hex_rgb('#0b2470'))

    def test_original_palette_matches_the_package(self):
        # make_im2_test_maps.palette: linear between five colours, truncated to whole numbers.
        self.assertEqual(list(rv.original_rgb(np.array([0.0]))[0]), [8, 18, 70])
        self.assertEqual(list(rv.original_rgb(np.array([1.0]))[0]), [255, 91, 24])
        self.assertEqual(list(rv.original_rgb(np.array([0.125]))[0]), [4, 66, 140])


class Geometry(unittest.TestCase):
    def test_every_pixel_maps_to_a_grid_cell_on_the_package_grid(self):
        gt = [-312000.0, 9600.0, 0, 312000.0, 0, -9600.0]
        row, col = rv.image_lookup(gt)
        self.assertEqual(row.shape, (rv.HEIGHT, rv.WIDTH))
        # The bottom image row is next to the pole: the centre cells (32, 32) of the 65 x 65 grid.
        self.assertTrue(np.all(np.abs(row[-1] - 32) <= 1) and np.all(np.abs(col[-1] - 32) <= 1))


if __name__ == '__main__':
    unittest.main()
