"""Write the display palettes into the visibility manifest's metadata (display only).

The team package's manifest (public/data/visibility-cap/manifest.json, DATA_SOURCES SRC-074)
described its original single blue-to-orange palette under "colors". The PNGs were redrawn on
2026-11-14 with per-target palettes (src/data/visibility/palette.json, scripts/data/
recolor_visibility.py), so that entry no longer described the images. This replaces it with the
palette the PNGs and the app's legends actually use, per target, and states the transparency rule.
The original palette is kept under "original_package_colors" for traceability. Frames, times,
bounds, grids and every numerical value are left exactly as they are.

    python scripts/data/visibility_manifest_palette.py           # write
    python scripts/data/visibility_manifest_palette.py --check   # fail if the manifest disagrees
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / 'public' / 'data' / 'visibility-cap' / 'manifest.json'
PALETTE = ROOT / 'src' / 'data' / 'visibility' / 'palette.json'


def display_metadata(palette):
    """The manifest's palette entries, built from palette.json alone."""
    a = palette['alpha']
    return {
        'colors': {
            target: {f"{stop['value']:g}": stop['color'] for stop in palette[target]['stops']}
            for target in ('sun', 'earth')
        },
        'colors_note': (
            'Display only: per-target palettes of the redrawn PNGs (linear between the stops), '
            'from src/data/visibility/palette.json. Values never come from colours.'
        ),
        'alpha': {
            'value_zero': a['zero'],
            'value_min': a['min'],
            'value_max': a['max'],
            'rule': (
                f"PNG alpha = {a['zero']:g} where the value is 0 (fully transparent); otherwise "
                f"{a['min']:g} + {a['max'] - a['min']:g} x value (so {a['min']:g} at the smallest "
                f"non-zero value and {a['max']:g} at 1). On the map this is multiplied by the "
                'layer opacity the app sets.'
            ),
        },
    }


def updated(manifest, palette):
    meta = display_metadata(palette)
    out = {}
    for key, value in manifest.items():
        if key == 'colors':
            if 'original_package_colors' not in manifest and not isinstance(
                next(iter(value.values()), None), dict
            ):
                out['original_package_colors'] = value
            out.update(meta)
        elif key in ('colors_note', 'alpha'):
            continue
        else:
            out[key] = value
    if 'colors' not in manifest:
        out.update(meta)
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    raw = MANIFEST.read_text(encoding='utf-8')
    manifest = json.loads(raw)
    palette = json.loads(PALETTE.read_text(encoding='utf-8'))
    new = updated(manifest, palette)
    # Everything else is unchanged: same keys and values apart from the palette metadata.
    keep = {k for k in manifest if k not in ('colors', 'colors_note', 'alpha', 'original_package_colors')}
    assert all(new[k] == manifest[k] for k in keep), 'a non-palette entry changed'
    if args.check:
        if new != manifest:
            sys.exit('manifest palette metadata disagrees with src/data/visibility/palette.json')
        print('manifest palette metadata agrees with palette.json')
        return
    MANIFEST.write_text(json.dumps(new, indent=2), encoding='utf-8')
    print(f'wrote the display palettes into {MANIFEST.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
