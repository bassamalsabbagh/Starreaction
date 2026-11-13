"""Terrain horizon profiles for sites, from a LOLA south-polar elevation GeoTIFF.

Offline only (CLAUDE.md exception 3): runs on a team laptop, never in the browser. Reads an
uncompressed float32 south-polar-stereographic GeoTIFF (as QGIS exports LDEM_80S_80MPP_ADJ) with
numpy alone, and writes src/data/terrainHorizons.ts. Rule: docs/LANDER_RULES.md, "Terrain horizon".

    python scripts/data/horizon_profile.py "<path to .tif>" --source "<text>" \
        --site demo-site-india -85.5 31

For each whole azimuth (clockwise from north) it finds the highest angle of the terrain seen from
the site's ground, out to MAX_DISTANCE_M or the map's edge, in true 3D on the 1737.4 km sphere.
"""
import argparse
import math
import struct
import sys
from pathlib import Path

import numpy as np

R = 1737400.0
MAX_DISTANCE_M = 250_000.0
OUT = Path(__file__).resolve().parents[2] / 'src' / 'data' / 'terrainHorizons.ts'


def read_header(path):
    """The first IFD's tags we need. Only classic little-endian TIFF, one band, float32, no
    compression, one row per strip in order (QGIS's default export); anything else is refused."""
    with open(path, 'rb') as f:
        if f.read(4) != b'II*\x00':
            sys.exit('Only classic little-endian TIFF is supported here (use rasterio otherwise).')
        f.seek(struct.unpack('<I', f.read(4))[0])
        tags = {}
        sizes = {1: 1, 2: 1, 3: 2, 4: 4, 11: 4, 12: 8, 16: 8}
        codes = {1: 'B', 2: 's', 3: 'H', 4: 'I', 11: 'f', 12: 'd', 16: 'Q'}
        for _ in range(struct.unpack('<H', f.read(2))[0]):
            tag, typ, n = struct.unpack('<HHI', f.read(8))
            raw = f.read(4)
            total = sizes.get(typ, 1) * n
            here = f.tell()
            if total > 4:
                f.seek(struct.unpack('<I', raw)[0])
                data = f.read(total)
                f.seek(here)
            else:
                data = raw[:total]
            if typ == 2:
                tags[tag] = data.rstrip(b'\0').decode('latin-1')
            elif typ in codes:
                tags[tag] = struct.unpack('<' + codes[typ] * n, data)
    need = {256, 257, 258, 259, 273, 278, 339, 33550, 33922, 34736, 34737}
    if not need <= tags.keys():
        sys.exit('The TIFF is missing size, strip or georeferencing tags.')
    width, height = tags[256][0], tags[257][0]
    if tags[258][0] != 32 or tags[339][0] != 3 or tags[259][0] != 1 or tags[278][0] != 1:
        sys.exit('Expected uncompressed float32 with one row per strip.')
    offsets = tags[273]
    if any(b - a != width * 4 for a, b in zip(offsets, offsets[1:])):
        sys.exit('Rows are not stored in order; use rasterio for this file.')
    if 'South Polar' not in tags[34737] or tags[34736][0] != -90.0 or R not in tags[34736]:
        sys.exit('Expected south polar stereographic on the 1737.4 km Moon sphere.')
    scale_x, scale_y = tags[33550][0], tags[33550][1]
    if scale_x != scale_y:
        sys.exit('Expected square pixels.')
    return {
        'offset': offsets[0], 'width': width, 'height': height, 'pixel_size': scale_x,
        'x0': tags[33922][3], 'y0': tags[33922][4],
    }


class Dem:
    def __init__(self, path):
        h = read_header(path)
        self.__dict__.update(h)
        self.z = np.memmap(path, dtype='<f4', mode='r', offset=h['offset'],
                           shape=(h['height'], h['width']))

    def pixel(self, lat, lon):
        """South polar stereographic on the sphere (lat_0 -90, lon_0 0, k 1), pixel centres."""
        lat, lon = np.radians(lat), np.radians(lon)
        rho = 2 * R * np.tan(np.pi / 4 + lat / 2)
        x, y = rho * np.sin(lon), rho * np.cos(lon)
        return (x - self.x0) / self.pixel_size - 0.5, (self.y0 - y) / self.pixel_size - 0.5

    def sample(self, col, row):
        """Bilinear height, NaN outside the map or on no-data."""
        col, row = np.asarray(col, float), np.asarray(row, float)
        ok = (col >= 0) & (row >= 0) & (col < self.width - 1) & (row < self.height - 1)
        c0 = np.clip(np.floor(col).astype(int), 0, self.width - 2)
        r0 = np.clip(np.floor(row).astype(int), 0, self.height - 2)
        fc, fr = col - c0, row - r0
        z = self.z
        top = z[r0, c0] * (1 - fc) + z[r0, c0 + 1] * fc
        bottom = z[r0 + 1, c0] * (1 - fc) + z[r0 + 1, c0 + 1] * fc
        return np.where(ok, top * (1 - fr) + bottom * fr, np.nan)


def unit(lat, lon):
    lat, lon = np.radians(lat), np.radians(lon)
    return np.stack([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)], axis=-1)


def destination(lat, lon, azimuth_deg, distance_m):
    p1, l1 = math.radians(lat), math.radians(lon)
    th, de = math.radians(azimuth_deg), np.asarray(distance_m) / R
    p2 = np.arcsin(np.sin(p1) * np.cos(de) + np.cos(p1) * np.sin(de) * np.cos(th))
    l2 = l1 + np.arctan2(np.sin(th) * np.sin(de) * np.cos(p1), np.cos(de) - np.sin(p1) * np.sin(p2))
    return np.degrees(p2), np.degrees(l2)


def horizon(dem, lat, lon):
    """Per whole azimuth: the terrain's highest angle (deg) and how far terrain is known (m)."""
    h0 = float(dem.sample(*dem.pixel(lat, lon)))
    if math.isnan(h0):
        sys.exit(f'The site {lat}, {lon} is outside the elevation map.')
    distances = np.arange(dem.pixel_size / 2, MAX_DISTANCE_M + dem.pixel_size, dem.pixel_size / 2)
    up = unit(lat, lon)
    at = (R + h0) * up
    elevations, known = [], []
    for azimuth in range(360):
        la, lo = destination(lat, lon, azimuth, distances)
        h = dem.sample(*dem.pixel(la, lo))
        valid = ~np.isnan(h)
        if not valid.any():
            sys.exit(f'No terrain at azimuth {azimuth}.')
        v = (R + h[valid])[:, None] * unit(la[valid], lo[valid]) - at
        angles = np.degrees(np.arcsin((v @ up) / np.linalg.norm(v, axis=1)))
        elevations.append(float(angles.max()))
        known.append(float(distances[valid].max()))
    return h0, elevations, min(known)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('tif')
    parser.add_argument('--source', required=True, help='shown in the app, e.g. a SRC id')
    parser.add_argument('--site', nargs=3, action='append', required=True,
                        metavar=('ID', 'LAT', 'LON'))
    args = parser.parse_args()
    dem = Dem(args.tif)
    entries = []
    for site_id, lat, lon in args.site:
        h0, elevations, radius = horizon(dem, float(lat), float(lon))
        print(f'{site_id}: ground {h0:.0f} m, horizon {min(elevations):.2f} to '
              f'{max(elevations):.2f} deg, known to {radius / 1000:.0f} km')
        values = ', '.join(f'{e:.2f}' for e in elevations)
        entries.append(
            f"  '{site_id}': {{\n"
            f'    elevations: Float32Array.from([{values}]),\n'
            f'    radiusM: {round(radius)},\n'
            f'    spacingM: {dem.pixel_size:g},\n'
            f'    source: {args.source!r},\n'
            f'  }},\n'
        )
    OUT.write_text(
        '/**\n'
        ' * Terrain horizons by site id: the terrain\'s highest angle for each whole azimuth.\n'
        ' * GENERATED by scripts/data/horizon_profile.py; do not edit by hand.\n'
        ' * Rule: docs/LANDER_RULES.md, "Terrain horizon".\n'
        ' */\n'
        "import type { HorizonProfile } from '../utils/terrainShadow';\n\n"
        'export const TERRAIN_HORIZONS: Readonly<Record<string, HorizonProfile>> = {\n'
        + ''.join(entries) + '};\n',
        encoding='utf-8', newline='\n')
    print(f'wrote {OUT}')


if __name__ == '__main__':
    main()
