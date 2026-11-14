"""Legend ends for the Layers panel: 1st and 99th percentiles of the valid values (display only).

The layers' own legend minimum and maximum (src/data/layers/index.json) are the single most extreme
pixels of the 40 m rasters (slope 89.27°, elevation -7275.95 m), so a few crater-wall pixels
stretched the legend. This writes src/data/layers/legendRange.json: for each layer the percentiles
of the valid values of the 160 m cap grid (80° S to the pole, no-data left out), read from the value
tiles. Elevation uses the 1st and 99th percentiles; slope keeps 0° and uses the 99th. It changes no
data file: the tiles and index.json stay as they are, and a reading is always the real value.

    python scripts/data/legend_range.py
"""
import glob
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
LAYERS = ROOT / 'public' / 'data' / 'layers'
INDEX = ROOT / 'src' / 'data' / 'layers' / 'index.json'
OUT = ROOT / 'src' / 'data' / 'layers' / 'legendRange.json'
# (low percentile or None for the layer's floor of 0, high percentile)
PERCENTILES = {'elevation': (1, 99), 'slope': (None, 99)}


def valid_values(layer, level):
    enc = layer['values']['encoding']
    size = INDEX_DATA['tileSize']
    dtype = '<u2' if enc['type'] == 'uint16' else '<i2'
    out = []
    for path in sorted(glob.glob(str(LAYERS / layer['id'] / 'values' / level / '*.bin'))):
        a = np.fromfile(path, dtype=dtype)
        if a.size != size * size:
            continue
        ok = a != enc['nodata']
        out.append(a[ok].astype(float) * enc['scale'] + enc['offset'])
    return np.concatenate(out)


INDEX_DATA = json.loads(INDEX.read_text(encoding='utf-8'))


def main():
    result = {}
    for layer in INDEX_DATA['layers']:
        if layer['id'] not in PERCENTILES or not layer.get('values'):
            continue
        low_p, high_p = PERCENTILES[layer['id']]
        base = valid_values(layer, 'base')
        low = 0.0 if low_p is None else float(np.percentile(base, low_p))
        high = float(np.percentile(base, high_p))
        patches = np.concatenate([valid_values(layer, p['id']) for p in layer['values']['levels']
                                  if p['id'] != 'base'])
        result[layer['id']] = {
            'min': round(low, 2),
            'max': round(high, 2),
            'lowPercentile': low_p,
            'highPercentile': high_p,
            'validPixels': int(base.size),
            'gridMin': round(float(base.min()), 2),
            'gridMax': round(float(base.max()), 2),
            'patchMax40m': round(float(patches.max()), 2),
            'indexLegend': [layer['legend']['min'], layer['legend']['max']] if layer.get('legend') else None,
        }
    OUT.write_text(json.dumps({
        'about': 'Legend ends (display only): percentiles of the valid 160 m cap values, from scripts/data/legend_range.py. The readings are always the real values.',
        'layers': result}, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
