"""Tests for make_map_layers.py with made-up arrays only (no real file).
Run: python -m unittest scripts/data/test_make_map_layers.py
"""
import math
import struct
import sys
import tempfile
import unittest
import zlib
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import make_map_layers as ml  # noqa: E402


class Projection(unittest.TestCase):
    def test_round_trip_and_known_distance(self):
        for lat, lon in [(-80.13, 1.44), (-84.7906, 29.1957), (-89.99, -120.0), (-80.0, 180.0)]:
            x, y = ml.to_xy(lat, lon)
            back_lat, back_lon = ml.to_latlon(x, y)
            self.assertAlmostEqual(float(back_lat), lat, places=9)
            self.assertAlmostEqual((float(back_lon) - lon + 540) % 360 - 180, 0, places=9)
        # 0 E points up (+y) and 90 E right (+x) on the south polar map (team sheet 1.2).
        x, y = ml.to_xy(-85.0, 0.0)
        self.assertAlmostEqual(float(x), 0.0, places=6)
        self.assertGreater(float(y), 0)
        x, y = ml.to_xy(-85.0, 90.0)
        self.assertGreater(float(x), 0)
        # 80 S lies 304.0 km from the pole on the map (the rasters' +-304 km edge).
        self.assertAlmostEqual(ml.RHO_COVER / 1000, 304.0, delta=0.1)


class GeoKeys(unittest.TestCase):
    def test_reads_inline_keys_and_doubles(self):
        # Made-up directory: version header, then 1025 = 1 (inline), 3092 -> doubles[1] = 1.0.
        tags = {34735: (1, 1, 0, 2, 1025, 0, 1, 1, 3092, 34736, 1, 1),
                34736: (-90.0, 1.0)}
        self.assertEqual(ml.geo_keys(tags), {1025: 1, 3092: 1.0})
        self.assertEqual(ml.geo_keys({}), {})


class Encoding(unittest.TestCase):
    def test_slope_keeps_zero_and_nodata_apart(self):
        values = np.array([[0.0, 0.004, 0.006, 89.99], [np.nan, 12.345, 0.0, 45.0]])
        valid = ml.valid_mask(values, 'nan')
        stored = ml.encode(values, valid, 'slope')
        self.assertEqual(stored.dtype, np.dtype('<u2'))
        self.assertEqual(stored[0, 0], 0)  # a valid 0 stays 0, not NoData
        self.assertEqual(stored[1, 0], 65535)  # NoData
        back = ml.decode(stored, 'slope')
        self.assertTrue(math.isnan(back[1, 0]))
        self.assertEqual(back[0, 0], 0.0)
        self.assertLessEqual(np.nanmax(np.abs(back - values)), 0.005 + 1e-12)

    def test_elevation_is_signed_metres(self):
        values = np.array([[-4321.4, 0.0, 6543.6, np.nan]])
        stored = ml.encode(values, ml.valid_mask(values, None), 'elevation')
        self.assertEqual(stored.dtype, np.dtype('<i2'))
        self.assertEqual(list(stored[0]), [-4321, 0, 6544, -32768])
        back = ml.decode(stored, 'elevation')
        self.assertEqual(back[0, 0], -4321.0)
        self.assertTrue(math.isnan(back[0, 3]))

    def test_a_file_nodata_value_is_honoured_but_zero_is_not_nodata(self):
        values = np.array([[0.0, -9999.0, 5.0]])
        self.assertEqual(list(ml.valid_mask(values, '-9999')[0]), [True, False, True])


class Levels(unittest.TestCase):
    def test_block_mean_uses_only_pixels_with_data(self):
        values = np.array([[1.0, 3.0, np.nan, np.nan],
                           [np.nan, 5.0, np.nan, np.nan]])
        out = ml.block_mean(values, ~np.isnan(values), 2)
        self.assertEqual(out[0, 0], 3.0)
        self.assertTrue(math.isnan(out[0, 1]))

    def test_tiles_are_padded_and_empty_ones_skipped(self):
        stored = np.full((300, 300), 65535, dtype='<u2')
        stored[10, 20] = 1234
        # A patch-like level near the pole, so no tile is beyond 80 S.
        level = {'pixelM': 40.0, 'col0': 7400, 'row0': 7400}
        with tempfile.TemporaryDirectory() as tmp:
            written = ml.write_tiles(stored, level, 'slope', Path(tmp))
            self.assertEqual(written, [[0, 0]])
            tile = np.frombuffer((Path(tmp) / '0_0.bin').read_bytes(), dtype='<u2').reshape(256, 256)
            self.assertEqual(tile[10, 20], 1234)

    def test_corner_tiles_beyond_80s_are_skipped(self):
        base = {'pixelM': 160.0, 'col0': 0, 'row0': 0}
        self.assertTrue(ml.tile_outside_cover(base, 0, 0))  # the map's corner
        self.assertFalse(ml.tile_outside_cover(base, 7, 7))  # the pole


class Png(unittest.TestCase):
    def test_writes_a_valid_rgba_png_that_decodes_back(self):
        rgba = np.random.default_rng(1).integers(0, 256, (5, 7, 4), dtype=np.uint8)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'x.png'
            ml.write_png(path, rgba)
            data = path.read_bytes()
        self.assertEqual(data[:8], b'\x89PNG\r\n\x1a\n')
        w, h = struct.unpack('>II', data[16:24])
        self.assertEqual((w, h), (7, 5))
        idat = data[data.index(b'IDAT') + 4:data.index(b'IEND') - 8]
        rows = np.frombuffer(zlib.decompress(idat), dtype=np.uint8).reshape(5, 1 + 7 * 4)
        self.assertTrue(np.all(rows[:, 0] == 1))
        undone = np.cumsum(rows[:, 1:].reshape(5, 7, 4).astype(np.int64), axis=1) % 256
        self.assertTrue(np.array_equal(undone.astype(np.uint8), rgba))


class OpaquePng(unittest.TestCase):
    def test_an_opaque_image_is_written_as_rgb_with_the_same_colours(self):
        rgba = np.random.default_rng(2).integers(0, 256, (3, 4, 4), dtype=np.uint8)
        rgba[..., 3] = 255
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'x.png'
            ml.write_png(path, rgba)
            data = path.read_bytes()
        self.assertEqual(data[25], 2)  # colour type 2: RGB
        idat = data[data.index(b'IDAT') + 4:data.index(b'IEND') - 8]
        rows = np.frombuffer(zlib.decompress(idat), dtype=np.uint8).reshape(3, 1 + 4 * 3)
        undone = np.cumsum(rows[:, 1:].reshape(3, 4, 3).astype(np.int64), axis=1) % 256
        self.assertTrue(np.array_equal(undone.astype(np.uint8), rgba[..., :3]))


if __name__ == '__main__':
    unittest.main()
