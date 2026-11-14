"""Redraw the visibility prototype's display PNGs with the presentation palettes (display only).

Offline, numpy and the standard library only. Reads each frame's numerical JSON grid in
public/data/visibility-cap/ (the team's package, DATA_SOURCES SRC-074) and draws its PNG again
with exactly the package's own geometry (1024 x 128 pixels, longitude -180..180, latitude -80..-90,
each pixel the nearest 9.6 km grid cell; build_full_cap.py `image_lookup`). Only the colours change:
src/data/visibility/palette.json gives the Sun and Earth palettes, a value of 0 is fully
transparent and opacity rises with the value. No value, timestamp, grid or bound is changed, and the
scientific generator is not run.

    python scripts/data/recolor_visibility.py            # check, then redraw every frame
    python scripts/data/recolor_visibility.py --check    # only check the geometry

Before drawing anything it redraws every frame with the package's ORIGINAL palette and requires the
result to equal the supplied PNG pixel for pixel, which proves the geometry is the package's own.
"""
import argparse
import json
import math
import struct
import sys
import zlib
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_map_layers import write_png  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'public' / 'data' / 'visibility-cap'
PALETTE = ROOT / 'src' / 'data' / 'visibility' / 'palette.json'
R = 1737400.0
WIDTH, HEIGHT = 1024, 128
# The package's original palette (make_im2_test_maps.palette), used only to check the geometry.
ORIGINAL_STOPS = np.array([0, 0.25, 0.5, 0.75, 1])
ORIGINAL_COLOURS = np.array([[8, 18, 70], [0, 115, 210], [0, 205, 175], [245, 218, 45], [255, 91, 24]])


def image_lookup(gt, size=65):
    """The grid cell behind each image pixel: build_full_cap.py's image_lookup, unchanged."""
    lon = np.radians(-180 + (np.arange(WIDTH) + .5) * 360 / WIDTH)
    lat = np.radians(-80 - (np.arange(HEIGHT) + .5) * 10 / HEIGHT)
    rho = 2 * R * np.tan(np.pi / 4 + lat[:, None] / 2)
    x = rho * np.sin(lon)[None, :]
    y = rho * np.cos(lon)[None, :]
    col = np.floor((x - gt[0]) / gt[1]).astype(int)
    row = np.floor((y - gt[3]) / gt[5]).astype(int)
    assert np.all((col >= 0) & (col < size) & (row >= 0) & (row < size))
    return row, col


def original_rgb(values):
    return np.stack([np.interp(values, ORIGINAL_STOPS, ORIGINAL_COLOURS[:, i]) for i in range(3)],
                    axis=-1).astype('uint8')


def hex_rgb(colour):
    return [int(colour[i:i + 2], 16) for i in (1, 3, 5)]


def styled_rgba(values, target, palette):
    """New colours: the target's palette (linear between stops); alpha 0 at 0, then min..max."""
    stops = palette[target]['stops']
    xs = np.array([s['value'] for s in stops], dtype=float)
    cs = np.array([hex_rgb(s['color']) for s in stops], dtype=float)
    rgb = np.stack([np.interp(values, xs, cs[:, i]) for i in range(3)], axis=-1)
    a = palette['alpha']
    alpha = np.where(values > 0, a['min'] + (a['max'] - a['min']) * values, a['zero'])
    out = np.empty(values.shape + (4,), dtype=np.uint8)
    out[..., :3] = np.round(rgb).astype(np.uint8)
    out[..., 3] = np.round(alpha * 255).astype(np.uint8)
    return out


def read_png(path):
    """Decode an 8-bit RGB or RGBA, non-interlaced PNG (all five row filters)."""
    data = path.read_bytes()
    w, h, depth, ctype, _, _, interlace = struct.unpack('>IIBBBBB', data[16:29])
    if depth != 8 or ctype not in (2, 6) or interlace:
        raise ValueError(f'{path.name}: unsupported PNG ({depth}-bit, type {ctype})')
    channels = 3 if ctype == 2 else 4
    idat, i = b'', 8
    while i < len(data):
        n = struct.unpack('>I', data[i:i + 4])[0]
        if data[i + 4:i + 8] == b'IDAT':
            idat += data[i + 8:i + 8 + n]
        i += 12 + n
    raw = np.frombuffer(zlib.decompress(idat), dtype=np.uint8).reshape(h, 1 + w * channels)
    stride = w * channels
    out = np.zeros((h, stride), dtype=np.int32)
    for r in range(h):
        ftype, line = raw[r, 0], raw[r, 1:].astype(np.int32)
        up = out[r - 1] if r else np.zeros(stride, dtype=np.int32)
        if ftype == 0:
            out[r] = line
        elif ftype == 2:
            out[r] = (line + up) % 256
        elif ftype in (1, 3, 4):
            row = np.zeros(stride, dtype=np.int32)
            for c in range(stride):
                left = row[c - channels] if c >= channels else 0
                if ftype == 1:
                    pred = left
                elif ftype == 3:
                    pred = (left + up[c]) // 2
                else:
                    ul = up[c - channels] if c >= channels else 0
                    p = left + up[c] - ul
                    pa, pb, pc = abs(p - left), abs(p - up[c]), abs(p - ul)
                    pred = left if pa <= pb and pa <= pc else (up[c] if pb <= pc else ul)
                row[c] = (line[c] + pred) % 256
            out[r] = row
        else:
            raise ValueError(f'{path.name}: bad filter {ftype}')
    return out.astype(np.uint8).reshape(h, w, channels)


def frame_values(frame):
    grid = json.loads((ASSETS / frame['numerical']).read_text(encoding='utf-8'))
    values = np.array(grid['values'], dtype=float).reshape(grid['height'], grid['width'])
    return grid, values


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--check', action='store_true', help='only check the geometry')
    args = parser.parse_args()
    manifest = json.loads((ASSETS / 'manifest.json').read_text(encoding='utf-8'))
    palette = json.loads(PALETTE.read_text(encoding='utf-8'))
    frames = manifest['frames']
    # 1. The geometry check. Every grid must share the first one's size and georeferencing (so one
    #    pixel-to-cell lookup serves all frames), and on a spread of frames (both ends and every
    #    100th, both targets) our redraw with the ORIGINAL palette must equal the supplied PNG pixel
    #    for pixel. Frames already redrawn (by an earlier run) are checked against today's palette.
    reference = None
    for frame in frames:
        grid, _ = frame_values(frame)
        key = (grid['width'], grid['height'], tuple(grid['geotransform']), grid['radius_m'])
        if reference is None:
            reference = key
            lookup = image_lookup(grid['geotransform'])
        elif key != reference:
            sys.exit(f"{frame['numerical']}: grid differs from the first frame's")
        if frame['rectangle_degrees'] != [-180, -90, 180, -80]:
            sys.exit(f"{frame['image']}: unexpected bounds {frame['rectangle_degrees']}")
    sample = sorted({0, len(frames) - 1, *range(0, len(frames), 100),
                     *[i for i, f in enumerate(frames) if f['time_utc'] in (frames[-1]['time_utc'],)]})
    checked = already = 0
    for n in sample:
        frame = frames[n]
        _, values = frame_values(frame)
        pixels = values[lookup]
        if np.any(pixels < 0):
            sys.exit(f"{frame['image']}: a cap pixel falls on NoData")
        png = read_png(ASSETS / frame['image'])
        if png.shape[:2] != (HEIGHT, WIDTH):
            sys.exit(f"{frame['image']}: {png.shape[1]} x {png.shape[0]}, not {WIDTH} x {HEIGHT}")
        styled = styled_rgba(pixels, frame['target'], palette)
        if png.shape[2] == 4 or (np.array_equal(png, styled[..., :3]) and np.all(styled[..., 3] == 255)):
            already += 1
            if not np.array_equal(png, styled[..., :png.shape[2]]):
                sys.exit(f"{frame['image']}: already redrawn, but not with today's palette")
            continue
        if not np.array_equal(png, original_rgb(pixels)):
            diff = np.abs(png.astype(int) - original_rgb(pixels).astype(int)).max()
            sys.exit(f"{frame['image']}: our geometry does not reproduce the supplied PNG (max {diff})")
        checked += 1
    print(f'geometry check: all {len(frames)} grids share one georeferencing; '
          f'{checked} sampled supplied PNGs reproduced exactly; {already} already redrawn')
    if args.check:
        return
    # 2. Redraw with the presentation palettes.
    written = 0
    for frame in frames:
        _, values = frame_values(frame)
        rgba = styled_rgba(values[lookup], frame['target'], palette)
        write_png(ASSETS / frame['image'], rgba)
        written += 1
    print(f'redrew {written} PNGs ({WIDTH} x {HEIGHT}, same bounds) with the presentation palettes')


if __name__ == '__main__':
    main()
