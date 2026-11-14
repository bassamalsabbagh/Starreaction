"""Map layers from the team's south-pole rasters (docs/LANDER_RULES.md, "Map layers: elevation and
slope"; DATA_SOURCES SRC-073). Offline only (CLAUDE.md exception 3): numpy and the standard library,
no GDAL. For each layer it reads a numerical GeoTIFF (values) and a *_color.tif (the team's render):

  public/data/layers/<layer>/values/<level>/<row>_<col>.bin   value tiles, 256 x 256, little-endian
  public/data/layers/<layer>/display/*.png                    the team's colours on lon/lat images
  src/data/layers/index.json                                   what the app reads (grid, encoding,
                                                               tiles, images, legend, source)
  src/data/layers/check.json, docs/LAYER_CHECK.md              decoded tiles against the originals

    python scripts/data/make_map_layers.py "<folder>" --source-id SRC-073

The folder holds elevation_40m.tif, elevation_40m_color.tif, slope_40m.tif, slope_40m_color.tif.
Values come only from the numerical file and colours only from the colour file (nearest pixel,
never blended). Values: 160 m across 80-90 S (mean of the 40 m pixels that hold data) and 40 m in a
patch around each site south of 80 S. An empty or missing numerical file leaves that layer's values
unavailable (its colours are still drawn) and says why.
"""
import argparse
import json
import math
import struct
import sys
import zlib
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
R = 1737400.0
TILE = 256
BASE_FACTOR = 4  # 40 m -> 160 m
PATCH_PX = 1024  # 40 m pixels: 40.96 km, 4 x 4 tiles
COVER_LAT = -80.0
GRID_PX = 15200
GRID_M = 40.0
GRID_EDGE_M = 304000.0
QUADRANT_PX = 2048
PREVIEW_PX = 512
LAYERS = ('elevation', 'slope')
# Built one at a time with --only (its own grid; merged into index.json, other layers untouched).
EXTRA_LAYERS = ('roughness',)
ENCODING = {
    'elevation': {'type': 'int16', 'scale': 1.0, 'offset': 0.0, 'nodata': -32768, 'unit': 'm'},
    'slope': {'type': 'uint16', 'scale': 0.01, 'offset': 0.0, 'nodata': 65535, 'unit': '°'},
    # Metres (the user, 2026-11-14), 1 mm steps: 0 to 65.534 m (the file's maximum is 63.25 m).
    'roughness': {'type': 'uint16', 'scale': 0.001, 'offset': 0.0, 'nodata': 65535, 'unit': 'm'},
}
LABEL = {'elevation': 'Elevation', 'slope': 'Slope', 'roughness': 'Roughness'}
LEGEND_STEP = {'elevation': 500.0, 'slope': 5.0, 'roughness': 0.25}


# ---- projection (south polar stereographic on the 1737.4 km sphere, 0 E up; team sheet 1.2) ----

def to_xy(lat_deg, lon_deg):
    lat = np.radians(lat_deg)
    lon = np.radians(lon_deg)
    rho = 2 * R * np.tan(np.pi / 4 + lat / 2)
    return rho * np.sin(lon), rho * np.cos(lon)


def to_latlon(x, y):
    rho = np.hypot(x, y)
    c = 2 * np.arctan(rho / (2 * R))
    return np.degrees(c) - 90.0, np.degrees(np.arctan2(x, y))


RHO_COVER = float(2 * R * math.tan(math.pi / 4 + math.radians(COVER_LAT) / 2))


# ---- reading the team's uncompressed GeoTIFFs ----

class RasterError(Exception):
    pass


def read_tiff(path):
    """Header of a classic little-endian, uncompressed, one-row-per-strip GeoTIFF, and a memmap of
    its pixels. Refuses anything else, and anything not on the expected polar grid."""
    path = Path(path)
    if not path.exists():
        raise RasterError(f'{path.name} is missing')
    if path.stat().st_size == 0:
        raise RasterError(f'{path.name} is empty (0 bytes)')
    with open(path, 'rb') as f:
        if f.read(4) != b'II*\x00':
            raise RasterError(f'{path.name}: only classic little-endian TIFF is supported')
        f.seek(struct.unpack('<I', f.read(4))[0])
        tags = {}
        sizes = {1: 1, 2: 1, 3: 2, 4: 4, 11: 4, 12: 8}
        codes = {1: 'B', 3: 'H', 4: 'I', 11: 'f', 12: 'd'}
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
    width, height = tags[256][0], tags[257][0]
    bands = tags.get(277, (1,))[0]
    bits = tags[258]
    if tags[259][0] != 1:
        raise RasterError(f'{path.name}: compressed files are not supported')
    if tags.get(278, (1,))[0] != 1:
        raise RasterError(f'{path.name}: expected one row per strip')
    offsets = tags[273]
    if bands == 1 and tags.get(339, (1,))[0] == 3 and bits[0] == 32:
        dtype, row_bytes = '<f4', width * 4
    elif bands == 4 and all(b == 8 for b in bits):
        dtype, row_bytes = 'u1', width * 4
    else:
        raise RasterError(f'{path.name}: expected float32 values or 8-bit RGBA colours')
    if any(b - a != row_bytes for a, b in zip(offsets, offsets[1:])):
        raise RasterError(f'{path.name}: rows are not stored in order')
    geo = tags.get(34736, ())
    if 'South Polar' not in tags.get(34737, '') or -90.0 not in geo or R not in geo:
        raise RasterError(f'{path.name}: expected south polar stereographic on the 1737.4 km sphere')
    keys = geo_keys(tags)
    if keys.get(1025) != 1:
        raise RasterError(f'{path.name}: expected PixelIsArea (the tiepoint is the top-left corner)')
    if keys.get(3075, 15) != 15:
        raise RasterError(f'{path.name}: expected a polar stereographic projection (GeoKey 3075 = 15)')
    if keys.get(3092, 1.0) != 1.0:
        raise RasterError(f'{path.name}: expected scale 1 at the pole')
    for key in (3080, 3088, 3095):  # natural origin / centre / pole longitude
        if keys.get(key, 0.0) != 0.0:
            raise RasterError(f'{path.name}: expected 0 E as the central longitude')
    pixel = tags[33550][0]
    if tags[33550][1] != pixel:
        raise RasterError(f'{path.name}: expected square pixels')
    if tags[33922][:2] != (0.0, 0.0):
        raise RasterError(f'{path.name}: expected the tiepoint at raster position (0, 0)')
    x0, y0 = tags[33922][3], tags[33922][4]
    # The same +-304 km square as the 40 m rasters; another pixel size is allowed (Roughness: 50 m)
    # as long as the pixels tile the square exactly.
    if (x0, y0) != (-GRID_EDGE_M, GRID_EDGE_M) or width != height or width * pixel != 2 * GRID_EDGE_M:
        raise RasterError(
            f'{path.name}: expected a square grid covering ({-GRID_EDGE_M:g}, {GRID_EDGE_M:g}) to '
            f'({GRID_EDGE_M:g}, {-GRID_EDGE_M:g}); got {width} x {height} at {pixel:g} m from ({x0:g}, {y0:g})')
    nodata = tags.get(42113)
    shape = (height, width) if bands == 1 else (height, width, 4)
    data = np.memmap(path, dtype=dtype, mode='r', offset=offsets[0], shape=shape)
    return {'path': path, 'width': width, 'height': height, 'pixel': pixel, 'x0': x0, 'y0': y0,
            'nodata': nodata, 'data': data}


def geo_keys(tags):
    """The GeoTIFF keys (GeoKeyDirectoryTag 34735) as {key id: value}, doubles looked up in 34736."""
    directory = tags.get(34735, ())
    doubles = tags.get(34736, ())
    keys = {}
    for i in range(4, len(directory) - 3, 4):
        key, location, count, value = directory[i:i + 4]
        if location == 0:
            keys[key] = value
        elif location == 34736 and count == 1 and value < len(doubles):
            keys[key] = doubles[value]
    return keys


def same_grid(a, b):
    keys = ('width', 'height', 'pixel', 'x0', 'y0')
    return all(a[k] == b[k] for k in keys)


def valid_mask(values, nodata):
    """True where a value holds data: not NaN and not the file's NoData (a valid 0 stays valid)."""
    ok = ~np.isnan(values)
    if nodata not in (None, '', 'nan', 'NaN'):
        ok &= values != float(nodata)
    return ok


# ---- value tiles ----

def encode(values, valid, layer):
    enc = ENCODING[layer]
    stored = np.where(valid, np.round((values - enc['offset']) / enc['scale']), 0)
    if enc['type'] == 'uint16':
        out = np.clip(stored, 0, 65534).astype('<u2')
    else:
        out = np.clip(stored, -32767, 32767).astype('<i2')
    out[~valid] = enc['nodata']
    return out


def decode(stored, layer):
    enc = ENCODING[layer]
    values = stored.astype(np.float64) * enc['scale'] + enc['offset']
    values[stored == enc['nodata']] = np.nan
    return values


def block_mean(values, valid, factor):
    """Mean of each factor x factor block over the pixels that hold data; NaN where none do."""
    h, w = values.shape
    v = np.where(valid, values, 0.0).astype(np.float64).reshape(h // factor, factor, w // factor, factor)
    n = valid.reshape(h // factor, factor, w // factor, factor).sum(axis=(1, 3))
    s = v.sum(axis=(1, 3))
    with np.errstate(invalid='ignore', divide='ignore'):
        return np.where(n > 0, s / np.maximum(n, 1), np.nan)


def tile_outside_cover(level, tr, tc):
    """True when the whole tile lies beyond 80 S (farther from the pole than the 80 S circle)."""
    px = level['pixelM']
    x_lo = -304000 + (level['col0'] + tc * TILE) * px
    x_hi = x_lo + TILE * px
    y_hi = 304000 - (level['row0'] + tr * TILE) * px
    y_lo = y_hi - TILE * px
    nx = min(max(0.0, x_lo), x_hi) if not (x_lo <= 0 <= x_hi) else 0.0
    ny = min(max(0.0, y_lo), y_hi) if not (y_lo <= 0 <= y_hi) else 0.0
    return math.hypot(nx, ny) > RHO_COVER


def write_tiles(stored, level, layer, out_dir):
    """Cut a level into 256 x 256 tiles (padded with NoData), skipping tiles beyond 80 S or with no
    data; returns the [row, col] of every tile written."""
    nodata = ENCODING[layer]['nodata']
    h, w = stored.shape
    written = []
    out_dir.mkdir(parents=True, exist_ok=True)
    for tr in range(math.ceil(h / TILE)):
        for tc in range(math.ceil(w / TILE)):
            if tile_outside_cover(level, tr, tc):
                continue
            tile = np.full((TILE, TILE), nodata, dtype=stored.dtype)
            part = stored[tr * TILE:(tr + 1) * TILE, tc * TILE:(tc + 1) * TILE]
            tile[:part.shape[0], :part.shape[1]] = part
            if np.all(tile == nodata):
                continue
            (out_dir / f'{tr}_{tc}.bin').write_bytes(tile.tobytes())
            written.append([tr, tc])
    return written


# ---- display images ----

def write_png(path, rgba):
    """An 8-bit PNG (filter 'Sub' on every row), with the standard library only: RGB when every
    pixel is opaque (same colours, smaller file), RGBA otherwise."""
    if np.all(rgba[..., 3] == 255):
        rgba = np.ascontiguousarray(rgba[..., :3])
    h, w, channels = rgba.shape
    sub = rgba.astype(np.int16)
    sub[:, 1:] -= rgba[:, :-1].astype(np.int16)
    rows = np.empty((h, w * channels + 1), dtype=np.uint8)
    rows[:, 0] = 1
    rows[:, 1:] = (sub % 256).astype(np.uint8).reshape(h, w * channels)

    def chunk(kind, data):
        return (struct.pack('>I', len(data)) + kind + data
                + struct.pack('>I', zlib.crc32(kind + data) & 0xFFFFFFFF))

    head = struct.pack('>IIBBBBB', w, h, 8, 6 if channels == 4 else 2, 0, 0, 0)
    body = zlib.compress(rows.tobytes(), 9)
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', head) + chunk(b'IDAT', body)
                     + chunk(b'IEND', b''))


def sample_colours(colour, lat, lon, inside=None):
    """The team's colour at each lon/lat (nearest 40 m pixel); transparent off the raster or where
    `inside` is False."""
    x, y = to_xy(lat, lon)
    col = np.floor((x - colour['x0']) / colour['pixel']).astype(np.int64)
    row = np.floor((colour['y0'] - y) / colour['pixel']).astype(np.int64)
    on = (col >= 0) & (row >= 0) & (col < colour['width']) & (row < colour['height'])
    if inside is not None:
        on &= inside(x, y)
    out = np.zeros(lat.shape + (4,), dtype=np.uint8)
    out[on] = colour['data'][row[on], col[on]]
    return out


def lonlat_grid(west, east, south, north, width, height):
    lon = west + (np.arange(width) + 0.5) * (east - west) / width
    lat = north - (np.arange(height) + 0.5) * (north - south) / height
    return np.meshgrid(lat, lon, indexing='ij')


def patch_bounds_lonlat(level, pixel):
    """The lon/lat box around a patch square (from its edges, finely sampled)."""
    x0 = -304000 + level['col0'] * pixel
    y0 = 304000 - level['row0'] * pixel
    side = level['width'] * pixel
    t = np.linspace(0, side, 200)
    xs = np.concatenate([x0 + t, x0 + t, np.full_like(t, x0), np.full_like(t, x0 + side)])
    ys = np.concatenate([np.full_like(t, y0), np.full_like(t, y0 - side), y0 - t, y0 - t])
    lat, lon = to_latlon(xs, ys)
    return float(lon.min()), float(lon.max()), float(lat.min()), float(lat.max())


# ---- legend ----

def legend(values, nodata, colour, step):
    """Which colour the team's render gives each value: the median colour of the pixels within
    +-step/20 of each stop (sampled every 8th pixel), and the largest spread found."""
    v = np.asarray(values[::8, ::8], dtype=np.float64)
    ok = valid_mask(v, nodata)
    c = np.asarray(colour['data'][::8, ::8])
    v, c = v[ok], c[ok]
    lo, hi = float(v.min()), float(v.max())
    stops, spread = [], 0.0
    for value in np.arange(math.floor(lo / step) * step, hi + step, step):
        near = np.abs(v - value) <= step / 20
        if near.sum() < 10:
            continue
        rgb = np.median(c[near][:, :3], axis=0).astype(int)
        spread = max(spread, float(c[near][:, :3].std(axis=0).max()))
        stops.append({'value': round(float(value), 2), 'color': '#%02x%02x%02x' % tuple(rgb)})
    return {'stops': stops, 'min': round(lo, 2), 'max': round(hi, 2),
            'maxColourSpread': round(spread, 1)}


# ---- main ----

def site_patches(pixel):
    sites = json.loads((ROOT / 'data' / 'sites.json').read_text(encoding='utf-8'))['sites']
    patches = []
    for site in sites:
        if site['lat'] > COVER_LAT:
            continue
        x, y = to_xy(site['lat'], site['lonEast'])
        col = int(math.floor((x + 304000) / pixel))
        row = int(math.floor((304000 - y) / pixel))
        size = 608000 // int(pixel)
        col0 = min(max(col - PATCH_PX // 2, 0), size - PATCH_PX)
        row0 = min(max(row - PATCH_PX // 2, 0), size - PATCH_PX)
        patches.append({'id': site['id'], 'col0': col0, 'row0': row0, 'site': (site['lat'], site['lonEast'])})
    return patches


def build_layer(layer, folder, out_public, patches, checks, report, values_path=None,
                colour_path=None):
    entry = {'id': layer, 'label': LABEL[layer], 'unit': ENCODING[layer]['unit'],
             'valuesFile': f'{layer}_40m.tif', 'colourFile': f'{layer}_40m_color.tif',
             'values': None, 'valuesUnavailable': None, 'display': None, 'legend': None}
    if colour_path is not None:
        entry['colourFile'] = Path(colour_path).name
    colour = read_tiff(Path(colour_path) if colour_path else folder / entry['colourFile'])
    pixel = colour['pixel']
    try:
        if values_path is not None:
            entry['valuesFile'] = Path(values_path).name
        values = read_tiff(Path(values_path) if values_path else folder / entry['valuesFile'])
        if not same_grid(values, colour):
            raise RasterError('the values and colour files are not on the same grid')
    except RasterError as error:
        values = None
        entry['valuesUnavailable'] = str(error).replace(
            entry['valuesFile'], f'The values file supplied ({entry["valuesFile"]})', 1)
        report.append(f'- {layer}: values unavailable: {entry["valuesUnavailable"]}')

    layer_dir = out_public / layer

    def has_data(x, y):
        """Draw a colour only where the values file holds data at that 40 m pixel (NoData stays
        transparent), and only inside 80 S."""
        ok = np.hypot(x, y) <= RHO_COVER
        if values is None:
            return ok
        col = np.clip(np.floor((x - values['x0']) / pixel).astype(np.int64), 0, values['width'] - 1)
        row = np.clip(np.floor((values['y0'] - y) / pixel).astype(np.int64), 0, values['height'] - 1)
        return ok & valid_mask(np.asarray(values['data'][row, col], dtype=np.float64),
                               values['nodata'])

    # Display: four lon/lat quarters of the cap at the 160 m view, then a 40 m image per patch.
    display = {'base': [], 'preview': [], 'patches': []}
    (layer_dir / 'display').mkdir(parents=True, exist_ok=True)
    for q in range(4):
        west, east = -180 + 90 * q, -90 + 90 * q
        lat, lon = lonlat_grid(west, east, -90.0, COVER_LAT, QUADRANT_PX, QUADRANT_PX)
        name = f'base-q{q}.png'
        write_png(layer_dir / 'display' / name, sample_colours(colour, lat, lon, has_data))
        display['base'].append({'file': name, 'west': west, 'east': east, 'south': -90.0, 'north': COVER_LAT})
        # A small preview first, so the layer shows at once while the full image loads.
        lat, lon = lonlat_grid(west, east, -90.0, COVER_LAT, PREVIEW_PX, PREVIEW_PX)
        name = f'preview-q{q}.png'
        write_png(layer_dir / 'display' / name, sample_colours(colour, lat, lon, has_data))
        display['preview'].append({'file': name, 'west': west, 'east': east, 'south': -90.0, 'north': COVER_LAT})
    for patch in patches:
        level = {'col0': patch['col0'], 'row0': patch['row0'], 'width': PATCH_PX}
        west, east, south, north = patch_bounds_lonlat(level, pixel)
        mid = math.radians((south + north) / 2)
        height = int(math.ceil(math.radians(north - south) * R / pixel))
        width = int(math.ceil(math.radians(east - west) * R * math.cos(mid) / pixel))
        lat, lon = lonlat_grid(west, east, south, north, width, height)
        px0, py0 = -304000 + patch['col0'] * pixel, 304000 - patch['row0'] * pixel
        side = PATCH_PX * pixel

        def inside(x, y, px0=px0, py0=py0, side=side):
            square = (x >= px0) & (x < px0 + side) & (y <= py0) & (y > py0 - side)
            return square & has_data(x, y)

        name = f'{patch["id"]}.png'
        write_png(layer_dir / 'display' / name, sample_colours(colour, lat, lon, inside))
        display['patches'].append({'id': patch['id'], 'file': name, 'west': west, 'east': east,
                                   'south': south, 'north': north})
    entry['display'] = display

    if values is None:
        return entry

    data = values['data']
    nodata = values['nodata']
    # 160 m base, in bands to keep memory small.
    size = values['width'] // BASE_FACTOR
    base = np.empty((size, size), dtype=np.float64)
    band = 400
    for r in range(0, size, band):
        rows = data[r * BASE_FACTOR:(r + band) * BASE_FACTOR]
        base[r:r + band] = block_mean(np.asarray(rows, dtype=np.float64),
                                      valid_mask(np.asarray(rows), nodata), BASE_FACTOR)
    base_valid = ~np.isnan(base)
    levels = []
    base_level = {'id': 'base', 'pixelM': pixel * BASE_FACTOR, 'col0': 0, 'row0': 0,
                  'width': size, 'height': size}
    base_level['tiles'] = write_tiles(encode(base, base_valid, layer), base_level, layer,
                                      layer_dir / 'values' / 'base')
    levels.append(base_level)
    for patch in patches:
        r0, c0 = patch['row0'], patch['col0']
        block = np.asarray(data[r0:r0 + PATCH_PX, c0:c0 + PATCH_PX], dtype=np.float64)
        level = {'id': patch['id'], 'pixelM': pixel, 'col0': c0, 'row0': r0,
                 'width': PATCH_PX, 'height': PATCH_PX}
        level['tiles'] = write_tiles(encode(block, valid_mask(block, nodata), layer), level, layer,
                                     layer_dir / 'values' / patch['id'])
        levels.append(level)
    entry['values'] = {'encoding': ENCODING[layer], 'levels': levels}
    entry['legend'] = legend(data, nodata, colour, LEGEND_STEP[layer])
    checks.extend(check_points(layer, values, levels, patches, layer_dir))
    return entry


def read_back(layer, layer_dir, level, col, row):
    """Decode the value at a level pixel from the tile written on disk."""
    tr, tc = row // TILE, col // TILE
    path = layer_dir / 'values' / level['id'] / f'{tr}_{tc}.bin'
    if not path.exists():
        return float('nan')
    dtype = '<u2' if ENCODING[layer]['type'] == 'uint16' else '<i2'
    tile = np.frombuffer(path.read_bytes(), dtype=dtype).reshape(TILE, TILE)
    return float(decode(tile[row % TILE:row % TILE + 1, col % TILE:col % TILE + 1], layer)[0, 0])


REPORT_ZERO = []


def check_points(layer, values, levels, patches, layer_dir):
    """Decoded tiles against the original 40 m pixels (patches) or their 4 x 4 mean (base)."""
    data, nodata, pixel = values['data'], values['nodata'], values['pixel']
    by_id = {level['id']: level for level in levels}
    points = []
    for patch in patches:
        points.append((f'{patch["id"]} site (40 m patch)', *patch['site']))
    im2 = next((p for p in patches if p['id'] == 'im2'), None)
    if im2:
        for label, row, col in [('im2 patch edge, first row inside (40 m)', im2['row0'], im2['col0'] + 300),
                                ('im2 patch edge, last row outside (160 m)', im2['row0'] - 1, im2['col0'] + 300)]:
            x = -304000 + (col + 0.5) * pixel
            y = 304000 - (row + 0.5) * pixel
            lat, lon = to_latlon(x, y)
            points.append((label, float(lat), float(lon)))
    points += [('Near the pole (160 m)', -89.99, 45.0), ('80.5 S, 180 E (160 m)', -80.5, 180.0),
               ('85 S, 90 W (160 m)', -85.0, -90.0)]
    # The lowest value inside coverage (every 40 m pixel, in bands), and an exact 0 there if any.
    best, best_rc, zero_rc = np.inf, None, None
    xs = -304000 + (np.arange(values['width']) + 0.5) * pixel
    for r in range(0, values['height'], 800):
        rows = np.asarray(data[r:r + 800], dtype=np.float64)
        ys = 304000 - (np.arange(r, r + rows.shape[0]) + 0.5) * pixel
        inside = np.hypot(xs[None, :], ys[:, None]) <= RHO_COVER
        ok = valid_mask(rows, nodata) & inside
        if not ok.any():
            continue
        masked = np.where(ok, rows, np.inf)
        i = int(np.argmin(masked))
        if masked.flat[i] < best:
            best, best_rc = float(masked.flat[i]), (r + i // rows.shape[1], i % rows.shape[1])
        if zero_rc is None and np.any(ok & (rows == 0)):
            zr, zc = np.argwhere(ok & (rows == 0))[0]
            zero_rc = (r + int(zr), int(zc))
    for label, rc in [(f'Lowest value inside coverage ({best:.4f})', best_rc),
                      ('An exact 0 inside coverage', zero_rc)]:
        if rc is None:
            continue
        x = -304000 + (rc[1] + 0.5) * pixel
        y = 304000 - (rc[0] + 0.5) * pixel
        lat, lon = to_latlon(x, y)
        points.append((label, float(lat), float(lon)))
    if zero_rc is None:
        REPORT_ZERO.append(f'- {layer}: no exact 0 inside coverage (lowest {best:.4f}); a valid 0 '
                           'is tested with made-up data only (scripts/data/test_make_map_layers.py)')
    points.append(('Outside coverage, 79.5 S', -79.5, 0.0))

    out = []
    step = ENCODING[layer]['scale']
    for label, lat, lon in points:
        x, y = to_xy(lat, lon)
        col40 = int(math.floor((x + 304000) / pixel))
        row40 = int(math.floor((304000 - y) / pixel))
        record = {'layer': layer, 'label': label, 'lat': round(lat, 6), 'lon': round(lon, 6),
                  'x': round(float(x), 1), 'y': round(float(y), 1)}
        if lat > COVER_LAT:
            record.update({'level': 'outside', 'original': None, 'decoded': None, 'pass': True})
            out.append(record)
            continue
        level = next((by_id[p['id']] for p in patches
                      if p['row0'] <= row40 < p['row0'] + PATCH_PX and p['col0'] <= col40 < p['col0'] + PATCH_PX),
                     by_id['base'])
        if level['id'] == 'base':
            r4, c4 = row40 // BASE_FACTOR * BASE_FACTOR, col40 // BASE_FACTOR * BASE_FACTOR
            block = np.asarray(data[r4:r4 + 4, c4:c4 + 4], dtype=np.float64)
            vm = valid_mask(block, nodata)
            original = float(block[vm].mean()) if vm.any() else float('nan')
            decoded = read_back(layer, layer_dir, level, col40 // BASE_FACTOR, row40 // BASE_FACTOR)
            pixel_value = float(data[row40, col40])
        else:
            original = float(data[row40, col40])
            decoded = read_back(layer, layer_dir, level, col40 - level['col0'], row40 - level['row0'])
            pixel_value = original
        both_nan = math.isnan(original) and math.isnan(decoded)
        diff = 0.0 if both_nan else abs(original - decoded)
        record.update({'level': level['id'], 'pixelM': level['pixelM'],
                       'originalPixel': None if math.isnan(pixel_value) else round(pixel_value, 6),
                       'original': None if math.isnan(original) else round(original, 6),
                       'decoded': None if math.isnan(decoded) else round(decoded, 6),
                       'diff': round(diff, 6), 'pass': both_nan or diff <= step / 2 + 1e-9})
        out.append(record)
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('folder')
    parser.add_argument('--source-id', required=True)
    parser.add_argument('--values', action='append', default=[], metavar='LAYER=PATH',
                        help='use this numerical file for a layer instead of <layer>_40m.tif')
    parser.add_argument('--colour', action='append', default=[], metavar='LAYER=PATH',
                        help='use this colour file for a layer instead of <layer>_40m_color.tif')
    parser.add_argument('--only', choices=EXTRA_LAYERS,
                        help='build only this layer on its own grid and add it to the existing '
                             'index.json; every other layer and its files stay as they are')
    args = parser.parse_args()
    folder = Path(args.folder)
    out_public = ROOT / 'public' / 'data' / 'layers'
    out_src = ROOT / 'src' / 'data' / 'layers'
    out_src.mkdir(parents=True, exist_ok=True)
    if args.only:
        pairs = {}
        for option, items in (('--values', args.values), ('--colour', args.colour)):
            for item in items:
                layer, _, path = item.partition('=')
                if layer != args.only or not path:
                    sys.exit(f'{option} expects {args.only}=PATH with --only, got {item!r}')
                pairs[option] = path
        build_only(args, folder, out_public, out_src, pairs)
        return
    reference = read_tiff(folder / 'slope_40m_color.tif')
    patches = site_patches(reference['pixel'])
    checks, report = [], []
    overrides = {}
    for item in args.values:
        layer, _, path = item.partition('=')
        if layer not in LAYERS or not path:
            sys.exit(f'--values expects one of {", ".join(LAYERS)}=PATH, got {item!r}')
        overrides[layer] = path
    entries = [build_layer(layer, folder, out_public, patches, checks, report, overrides.get(layer))
               for layer in LAYERS]
    manifest = {
        'version': 1,
        'sourceId': args.source_id,
        'projection': {'kind': 'polar-stereographic-south', 'radiusM': R, 'centralLonDeg': 0,
                       'originX': reference['x0'], 'originY': reference['y0'],
                       'pixelM': reference['pixel'], 'widthPx': reference['width'],
                       'heightPx': reference['height']},
        'coverMaxLatDeg': COVER_LAT,
        'tileSize': TILE,
        'layers': entries,
    }
    (out_src / 'index.json').write_text(json.dumps(manifest, indent=1) + '\n', encoding='utf-8')
    (out_src / 'check.json').write_text(json.dumps(checks, indent=1) + '\n', encoding='utf-8')
    all_pass = all(c['pass'] for c in checks)
    lines = ['# Map layers: decoded tiles against the original rasters', '',
             'Generated by `scripts/data/make_map_layers.py`; do not edit by hand. Rule: '
             'docs/LANDER_RULES.md, "Map layers: elevation and slope". Source: DATA_SOURCES '
             f'{args.source_id}.', '',
             f'**Overall: {"all checks pass" if all_pass else "SOME CHECKS FAIL"}.** A patch value '
             'must equal the original 40 m pixel, and a 160 m value the mean of its 4 x 4 pixels, '
             'within half the stored step. Compare the "original pixel" column with QGIS (Identify '
             'tool) at the same point.', '']
    report += REPORT_ZERO
    lines += report + ([''] if report else [])
    lines += ['| Layer | Point | Lat | Lon | Stereographic x, y (m) | Level | Original pixel | '
              'Expected | Decoded | Result |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |']
    for c in checks:
        lines.append(f"| {c['layer']} | {c['label']} | {c['lat']} | {c['lon']} | {c['x']}, {c['y']} | "
                     f"{c['level']}{' (' + str(int(c['pixelM'])) + ' m)' if 'pixelM' in c else ''} | "
                     f"{c.get('originalPixel')} | {c['original']} | {c['decoded']} | "
                     f"{'Pass' if c['pass'] else '**FAIL**'} |")
    lines.append('')
    (ROOT / 'docs' / 'LAYER_CHECK.md').write_text('\n'.join(lines), encoding='utf-8')
    sizes = {}
    for path in out_public.rglob('*'):
        if path.is_file():
            key = path.relative_to(out_public).parts[0] + '/' + path.relative_to(out_public).parts[1]
            sizes[key] = sizes.get(key, 0) + path.stat().st_size
    for key, total in sorted(sizes.items()):
        print(f'{key}: {total / 1e6:.1f} MB')
    for c in checks:
        print(('ok  ' if c['pass'] else 'FAIL') + f" {c['layer']} {c['label']}: original {c['original']} decoded {c['decoded']}")
    for line in report:
        print(line)
    if not all_pass:
        sys.exit(1)


def build_only(args, folder, out_public, out_src, pairs):
    """One extra layer on its own grid (its own site patches and a 4x base), added to the existing
    index.json. The other layers' entries, tiles and images are not touched; its checks go to their
    own files."""
    layer = args.only
    index_path = out_src / 'index.json'
    manifest = json.loads(index_path.read_text(encoding='utf-8'))
    colour_path = pairs.get('--colour') or str(folder / f'{layer}_color.tif')
    values_path = pairs.get('--values') or str(folder / f'{layer}.tif')
    colour = read_tiff(colour_path)
    patches = site_patches(colour['pixel'])
    checks, report = [], []
    entry = build_layer(layer, folder, out_public, patches, checks, report, values_path, colour_path)
    entry['sourceId'] = args.source_id
    manifest['layers'] = [item for item in manifest['layers'] if item['id'] != layer] + [entry]
    index_path.write_text(json.dumps(manifest, indent=1) + '\n', encoding='utf-8')
    (out_src / f'check-{layer}.json').write_text(json.dumps(checks, indent=1) + '\n', encoding='utf-8')
    all_pass = all(c['pass'] for c in checks)
    lines = [f'# Map layer {layer}: decoded tiles against the original raster', '',
             f'Generated by `scripts/data/make_map_layers.py --only {layer}`; do not edit by hand. '
             f'Source: DATA_SOURCES {args.source_id}. Pixel {colour["pixel"]:g} m (site patches), '
             f'{colour["pixel"] * BASE_FACTOR:g} m (base). The point labels say 40 m and 160 m '
             'for the elevation and slope grids; here read them as these sizes.', '',
             f'**Overall: {"all checks pass" if all_pass else "SOME CHECKS FAIL"}.**', '']
    lines += report + REPORT_ZERO + ['']
    lines += ['| Point | Lat | Lon | Level | Original pixel | Expected | Decoded | Result |',
              '| --- | --- | --- | --- | --- | --- | --- | --- |']
    for c in checks:
        lines.append(f"| {c['label']} | {c['lat']} | {c['lon']} | {c['level']} | "
                     f"{c.get('originalPixel')} | {c['original']} | {c['decoded']} | "
                     f"{'Pass' if c['pass'] else '**FAIL**'} |")
    (ROOT / 'docs' / f'LAYER_CHECK_{layer.upper()}.md').write_text('\n'.join(lines) + '\n',
                                                                  encoding='utf-8')
    for c in checks:
        print(('ok  ' if c['pass'] else 'FAIL') + f" {c['label']}: original {c['original']} decoded {c['decoded']}")
    if not all_pass:
        sys.exit(1)


if __name__ == '__main__':
    main()
