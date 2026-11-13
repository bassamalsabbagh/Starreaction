"""Tests for elevation_grid.py's checks and grid maths, with made-up numbers only (no rasterio,
no real file). Run: python -m unittest scripts/data/test_elevation_grid.py
"""
import math
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import elevation_grid as eg  # noqa: E402

GOOD = {'proj': 'stere', 'lat_0': -90, 'lon_0': 0, 'k': 1, 'x_0': 0, 'y_0': 0, 'R': 1737400,
        'units': 'm'}


class Projection(unittest.TestCase):
    def test_accepts_the_pgda_projection(self):
        self.assertEqual(eg.check_projection(GOOD, 'metre'), [])
        # The same sphere given as a = b, and true scale at -90 instead of k.
        alt = {'proj': 'stere', 'lat_0': -90, 'lon_0': 0, 'lat_ts': -90, 'a': 1737400,
               'b': 1737400}
        self.assertEqual(eg.check_projection(alt, 'm'), [])

    def test_refuses_anything_else_and_says_why(self):
        self.assertIn("projection is 'eqc'", eg.check_projection({**GOOD, 'proj': 'eqc'}, 'm')[0])
        self.assertTrue(any('north' in p or '-90' in p
                            for p in eg.check_projection({**GOOD, 'lat_0': 90}, 'm')))
        self.assertTrue(any('1737400' in p for p in eg.check_projection({**GOOD, 'R': 1738100}, 'm')))
        self.assertTrue(any('metres' in p for p in eg.check_projection(GOOD, 'kilometre')))

    def test_refuses_scaled_or_offset_heights(self):
        self.assertEqual(eg.check_scale(1, 0), [])
        self.assertEqual(eg.check_scale(None, None), [])
        self.assertIn('scaled', eg.check_scale(0.5, 0)[0])
        self.assertIn('offset', eg.check_scale(1, 1737400)[0])

    def test_refuses_a_cut_with_no_heights(self):
        with self.assertRaises(eg.Refused):
            eg.summarise(np.full((3, 3), np.nan, dtype='float32'))
        low, high, gaps = eg.summarise(np.array([[1, np.nan], [3, 4]], dtype='float32'))
        self.assertEqual((low, high, gaps), (1.0, 4.0, 0.25))

    def test_height_units(self):
        self.assertEqual(eg.check_height_units('m', False), [])
        self.assertEqual(eg.check_height_units('', True), [])
        self.assertIn('--heights-in-metres', eg.check_height_units('', False)[0])
        self.assertIn('not metres', eg.check_height_units('km', True)[0])


class Grid(unittest.TestCase):
    def test_80s_is_304_km_from_the_pole(self):
        self.assertAlmostEqual(eg.polar_rho(-90), 0, places=6)
        self.assertEqual(round(eg.polar_rho(-80) / 1000), 304)

    def test_cuts_the_window_around_the_pole(self):
        # A made-up 7600 x 7600 grid of 80 m pixels, corner at (-304000, 304000).
        transform = (80.0, 0.0, -304000.0, 0.0, -80.0, 304000.0)
        col, row, cols, rows = eg.cut_window(transform, 7600, 7600, -85)
        reach = eg.polar_rho(-85)
        self.assertAlmostEqual(-304000 + col * 80, -reach, delta=80)
        self.assertAlmostEqual(-304000 + (col + cols) * 80, reach, delta=80)
        self.assertEqual(cols, rows)
        with self.assertRaises(eg.Refused):
            eg.cut_window((80.0, 0, 1e7, 0, -80.0, 1e7), 10, 10, -85)

    def test_reduces_to_whole_cells(self):
        self.assertEqual(eg.reduce_shape(7600, 7600, 1024), (8, 7600, 7600))
        self.assertEqual(eg.reduce_shape(1000, 900, 1024), (1, 1000, 900))
        self.assertEqual(eg.reduce_shape(2050, 2050, 1024), (3, 2049, 2049))

    def test_reads_heights_like_the_app(self):
        # A made-up tilted plane on 5 x 5 cells of 100 m centred on the pole: z = 0.5 x.
        manifest = eg.build_manifest(5, 5, 100, -200, 200, -89.99, 'SRC-999', 't', 'f', 100)
        xs = np.array([-200, -100, 0, 100, 200], dtype='float32')
        grid = np.tile(0.5 * xs, (5, 1))
        self.assertAlmostEqual(eg.value_at(grid, manifest, -90, 0), 0.0, places=4)
        rho = eg.polar_rho(-89.997)
        self.assertAlmostEqual(eg.value_at(grid, manifest, -89.997, 90), 0.5 * rho, places=2)
        self.assertTrue(math.isnan(eg.value_at(grid, manifest, -80, 0)))


class Sources(unittest.TestCase):
    TABLE = ('| ID | Title | Publisher |\n| --- | --- | --- |\n'
             '| SRC-048 | A New View of the Lunar South Pole from LOLA | NASA |\n')

    def test_takes_the_title_from_the_register(self):
        self.assertEqual(eg.source_title('SRC-048', self.TABLE),
                         'A New View of the Lunar South Pole from LOLA')

    def test_refuses_a_source_that_is_not_recorded(self):
        with self.assertRaises(eg.Refused):
            eg.source_title('SRC-123', self.TABLE)
        with self.assertRaises(eg.Refused):
            eg.source_title('LOLA', self.TABLE)

    def test_writes_the_description_the_app_checks(self):
        m = eg.build_manifest(1024, 1024, 593.75, -303703.125, 303703.125, -80, 'SRC-048', 'T',
                              'LDEM_80S_80MPP_ADJ.TIF', 80)
        self.assertEqual(m['format'], 'float32-le')
        self.assertEqual(m['projection'], {'kind': 'polar-stereographic-south', 'radiusM': 1737400,
                                           'centralLonDeg': 0, 'scale': 1})
        self.assertEqual(m['heights']['unit'], 'm')
        self.assertEqual(m['source']['id'], 'SRC-048')


if __name__ == '__main__':
    unittest.main()
