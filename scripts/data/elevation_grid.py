"""Turn a NASA PGDA south-pole LOLA elevation GeoTIFF into the app's small elevation grid.

Offline only (CLAUDE.md exception 3): runs on a team laptop, never in the browser. Method and
rules: docs/LANDER_RULES.md, "Elevation and slope at a point". How to use: docs/ELEVATION_DATA.md.

    python scripts/data/elevation_grid.py data-raw/LDEM_80S_80MPP_ADJ.TIF --source SRC-048 --heights-in-metres

It checks that the file is one band of heights on a south polar stereographic grid on the
1737.4 km sphere (and stops with a clear error otherwise), cuts it to the pole out to --max-lat,
averages it down to at most --max-size cells a side, and writes:

    public/data/elevation/south-pole.f32   heights, float32 little-endian, row 0 at the top, NaN gaps
    src/data/elevation/southPole.json      the description: grid, projection, source

The source must already be an entry in docs/DATA_SOURCES.md ("No entry, no data").
"""
import argparse
import datetime
import json
import math
import re
import sys
from pathlib import Path

import numpy as np

R = 1_737_400.0
ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / 'public' / 'data' / 'elevation'
BIN_NAME = 'south-pole.f32'
MANIFEST = ROOT / 'src' / 'data' / 'elevation' / 'southPole.json'
DATA_SOURCES = ROOT / 'docs' / 'DATA_SOURCES.md'


class Refused(Exception):
    """The input is not what the app can use; the message says why and what to do."""


def polar_rho(lat_deg: float) -> float:
    """Distance from the pole on the south polar stereographic plane, metres."""
    return 2 * R * math.tan(math.pi / 4 + math.radians(lat_deg) / 2)


def check_projection(params: dict, linear_units: str) -> list:
    """Problems with the file's projection (empty when it is the south polar one on 1737.4 km)."""
    problems = []
    near = lambda value, want, tol=1e-6: value is not None and abs(float(value) - want) <= tol
    if params.get('proj') != 'stere':
        problems.append(f"projection is {params.get('proj')!r}, not polar stereographic ('stere')")
    if not near(params.get('lat_0'), -90.0):
        problems.append(f"centre latitude is {params.get('lat_0')}, not -90 (the south pole)")
    if not near(params.get('lon_0', 0.0), 0.0):
        problems.append(f"central longitude is {params.get('lon_0')}, not 0")
    if 'k' in params and not near(params['k'], 1.0):
        problems.append(f"scale factor is {params['k']}, not 1")
    if 'lat_ts' in params and not near(params['lat_ts'], -90.0):
        problems.append(f"true-scale latitude is {params['lat_ts']}, not -90")
    if not (near(params.get('x_0', 0.0), 0.0) and near(params.get('y_0', 0.0), 0.0)):
        problems.append('false easting/northing are not 0')
    radius = params.get('R')
    if radius is None and near(params.get('a'), params.get('b', -1), 1e-3):
        radius = params.get('a')
    if not near(radius, R, 1.0):
        problems.append(f'sphere radius is {radius}, not 1737400 m')
    if linear_units.lower() not in ('metre', 'meter', 'm', 'metres', 'meters'):
        problems.append(f'grid units are {linear_units!r}, not metres')
    return problems


def check_height_units(units: str, heights_in_metres: bool) -> list:
    """Heights must be metres: declared so in the file, or confirmed by the source (the flag)."""
    unit = (units or '').strip().lower()
    if unit in ('m', 'metre', 'meter', 'metres', 'meters'):
        return []
    if unit:
        return [f"heights are in {units!r}, not metres"]
    if heights_in_metres:
        return []
    return ['the file does not say its height unit; if its source says metres, add --heights-in-metres']


def check_scale(scale, offset) -> list:
    """Heights stored as plain values: a file that scales or offsets them is refused (not guessed)."""
    problems = []
    if scale is not None and float(scale) != 1.0:
        problems.append(f'heights are stored scaled (x{scale}); export them as plain metres')
    if offset is not None and float(offset) != 0.0:
        problems.append(f'heights are stored with an offset ({offset}); export them as plain metres')
    return problems


def summarise(heights: np.ndarray) -> tuple:
    """Lowest and highest height and the share of gaps; refused when the cut has no heights."""
    valid = heights[~np.isnan(heights)]
    if valid.size == 0:
        raise Refused('the cut area has no heights at all (every cell is a gap)')
    return float(valid.min()), float(valid.max()), float(np.isnan(heights).mean())


def cut_window(transform: tuple, width: int, height: int, max_lat: float) -> tuple:
    """The pixel window (col, row, cols, rows) covering the pole out to max_lat, inside the file.

    transform: (pixel size x, 0, left x, 0, -pixel size y, top y), north up.
    """
    px, _, left, _, neg_py, top = transform
    reach = polar_rho(max_lat)
    col0 = max(0, int(math.floor((-reach - left) / px)))
    col1 = min(width, int(math.ceil((reach - left) / px)))
    row0 = max(0, int(math.floor((top - reach) / -neg_py)))
    row1 = min(height, int(math.ceil((top + reach) / -neg_py)))
    if col1 <= col0 or row1 <= row0:
        raise Refused(f'the file does not cover the pole out to {max_lat}°')
    return col0, row0, col1 - col0, row1 - row0


def reduce_shape(cols: int, rows: int, max_size: int) -> tuple:
    """Whole-cell averaging: the factor, and the window trimmed to a multiple of it."""
    factor = max(1, math.ceil(max(cols, rows) / max_size))
    return factor, (cols // factor) * factor, (rows // factor) * factor


def build_manifest(width, height, pixel, origin_x, origin_y, max_lat, source_id, title, file_name,
                   native_pixel):
    """The description the app checks (src/utils/elevationGrid.ts readElevationManifest)."""
    return {
        'version': 1,
        'file': BIN_NAME,
        'format': 'float32-le',
        'width': int(width),
        'height': int(height),
        'pixelSizeM': float(pixel),
        'originX': float(origin_x),
        'originY': float(origin_y),
        'projection': {
            'kind': 'polar-stereographic-south',
            'radiusM': int(R),
            'centralLonDeg': 0,
            'scale': 1,
        },
        # The 1737.4 km reference is stated for the older, unadjusted maps (SRC-053) and assumed
        # for the adjusted ones (docs/LANDER_RULES.md, "Elevation and slope at a point").
        'heights': {'unit': 'm', 'reference': 'sphere 1737400 m (assumed for adjusted files)'},
        'maxLatDeg': float(max_lat),
        'source': {
            'id': source_id,
            'title': title,
            'file': file_name,
            'nativePixelM': float(native_pixel),
        },
        'createdBy': 'scripts/data/elevation_grid.py',
        'createdAt': datetime.date.today().isoformat(),
    }


def source_title(source_id: str, sources_md: str) -> str:
    """The title of a source in docs/DATA_SOURCES.md's register; refused if it isn't there."""
    if not re.fullmatch(r'SRC-\d{3}', source_id):
        raise Refused(f'{source_id!r} is not a source id like SRC-048')
    for line in sources_md.splitlines():
        cells = [cell.strip() for cell in line.strip().strip('|').split('|')]
        if len(cells) > 2 and cells[0] == source_id:
            return cells[1]
    raise Refused(f'{source_id} is not in docs/DATA_SOURCES.md: add the source first')


def value_at(grid: np.ndarray, manifest: dict, lat: float, lon: float) -> float:
    """Bilinear height at a point, as the app reads it (for the first-file checklist)."""
    rho = polar_rho(lat)
    x, y = rho * math.sin(math.radians(lon)), rho * math.cos(math.radians(lon))
    col = (x - manifest['originX']) / manifest['pixelSizeM']
    row = (manifest['originY'] - y) / manifest['pixelSizeM']
    rows, cols = grid.shape
    if not (0 <= col <= cols - 1 and 0 <= row <= rows - 1):
        return float('nan')
    c0, r0 = min(int(col), cols - 2), min(int(row), rows - 2)
    fc, fr = col - c0, row - r0
    top = grid[r0, c0] * (1 - fc) + grid[r0, c0 + 1] * fc
    bottom = grid[r0 + 1, c0] * (1 - fc) + grid[r0 + 1, c0 + 1] * fc
    return float(top * (1 - fr) + bottom * fr)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('tif', help='the GeoTIFF, e.g. data-raw/LDEM_80S_80MPP_ADJ.TIF')
    parser.add_argument('--source', required=True, help='its docs/DATA_SOURCES.md id, e.g. SRC-048')
    parser.add_argument('--max-lat', type=float, default=-80.0,
                        help='cover the pole out to this latitude (default -80)')
    parser.add_argument('--max-size', type=int, default=1024,
                        help='at most this many cells a side (default 1024, about 4 MB)')
    parser.add_argument('--heights-in-metres', action='store_true',
                        help="the file doesn't say its height unit, but its source says metres")
    args = parser.parse_args(argv)

    try:
        import rasterio
        from rasterio.enums import Resampling
        from rasterio.windows import Window
    except ImportError:
        sys.exit('rasterio is not installed. In a virtual environment: '
                 'pip install -r scripts/data/requirements.txt')

    try:
        title = source_title(args.source, DATA_SOURCES.read_text(encoding='utf-8'))
        with rasterio.open(args.tif) as src:
            if src.count != 1:
                raise Refused(f'the file has {src.count} bands; an elevation file has 1')
            if src.crs is None:
                raise Refused('the file has no projection')
            problems = check_projection(src.crs.to_dict(), src.crs.linear_units or '')
            problems += check_height_units(src.units[0] if src.units else '', args.heights_in_metres)
            problems += check_scale(src.scales[0] if src.scales else 1,
                                    src.offsets[0] if src.offsets else 0)
            t = src.transform
            if t.b != 0 or t.d != 0 or t.e >= 0:
                problems.append('the grid is rotated or not north-up')
            if abs(t.a - -t.e) > 1e-9:
                problems.append(f'pixels are not square ({t.a} x {-t.e} m)')
            if problems:
                raise Refused('; '.join(problems))

            col, row, cols, rows = cut_window((t.a, t.b, t.c, t.d, t.e, t.f), src.width,
                                              src.height, args.max_lat)
            factor, cols, rows = reduce_shape(cols, rows, args.max_size)
            out_cols, out_rows = cols // factor, rows // factor
            data = src.read(1, window=Window(col, row, cols, rows), out_shape=(out_rows, out_cols),
                            resampling=Resampling.average, masked=True)
            heights = np.ma.filled(data.astype('float32'), np.nan)
        low, high, gaps = summarise(heights)
    except Refused as refused:
        sys.exit(f'Refused: {refused}.')

    pixel = t.a * factor
    left = t.c + col * t.a
    top = t.f + row * t.e
    manifest = build_manifest(out_cols, out_rows, pixel, left + pixel / 2, top - pixel / 2,
                              args.max_lat, args.source, title, Path(args.tif).name, t.a)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    heights.astype('<f4').tofile(OUT_DIR / BIN_NAME)
    MANIFEST.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8', newline='\n')

    print(f'{out_cols} x {out_rows} cells of {pixel:g} m (from {t.a:g} m, x{factor} averaged)')
    print(f'heights {low:.0f} to {high:.0f} m; gaps {gaps:.2%}')
    print(f'wrote {OUT_DIR / BIN_NAME} ({heights.nbytes / 1e6:.1f} MB) and {MANIFEST}')
    print('For the first-file checklist (docs/ELEVATION_DATA.md), the app will read:')
    for name, lat, lon in (('the pole', -90.0, 0.0), ('85.5 S, 31 E', -85.5, 31.0)):
        print(f'  {name}: {value_at(heights, manifest, lat, lon):.1f} m')
    print(f'Then mark {args.source} "Adopted" in docs/DATA_SOURCES.md.')


if __name__ == '__main__':
    main()
