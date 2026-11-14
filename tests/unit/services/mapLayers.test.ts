import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  decodeStored,
  layerValueAt,
  locateValue,
  MAP_LAYERS,
  readMapLayers,
  type MapLayer,
  type MapLayersManifest,
} from '../../../src/services/mapLayers';
import { toPolarXY } from '../../../src/utils/elevationGrid';

// A made-up 2-level layer for these tests only (not the team's data): a 1280 m-wide raster of 40 m
// pixels (32 × 32) around the pole, a base level at 160 m (8 × 8, one tile) and a 40 m patch.
const RAW = {
  version: 1,
  sourceId: 'SRC-999',
  projection: {
    kind: 'polar-stereographic-south',
    radiusM: 1737400,
    centralLonDeg: 0,
    originX: -640,
    originY: 640,
    pixelM: 40,
    widthPx: 32,
    heightPx: 32,
  },
  coverMaxLatDeg: -80,
  tileSize: 4,
  layers: [
    {
      id: 'slope',
      label: 'Slope',
      unit: '°',
      values: {
        encoding: { type: 'uint16', scale: 0.01, offset: 0, nodata: 65535, unit: '°' },
        levels: [
          {
            id: 'base',
            pixelM: 160,
            col0: 0,
            row0: 0,
            width: 8,
            height: 8,
            tiles: [
              [0, 0],
              [1, 1],
            ],
          },
          { id: 'p1', pixelM: 40, col0: 16, row0: 0, width: 8, height: 8, tiles: [[0, 0]] },
        ],
      },
      valuesUnavailable: null,
      display: { base: [], preview: [], patches: [] },
      legend: null,
    },
    {
      id: 'elevation',
      label: 'Elevation',
      unit: 'm',
      values: null,
      valuesUnavailable: 'The values file supplied (elevation_40m.tif) is empty (0 bytes)',
      display: { base: [], preview: [], patches: [] },
      legend: null,
    },
  ],
};

const manifest = readMapLayers(RAW) as MapLayersManifest;
const [slope, elevation] = manifest.layers as [MapLayer, MapLayer];

/** The point at the centre of a 40 m pixel of the made-up raster. */
function pointAt(col: number, row: number) {
  const x = -640 + (col + 0.5) * 40;
  const y = 640 - (row + 0.5) * 40;
  const rho = Math.hypot(x, y);
  const lat = (2 * Math.atan(rho / (2 * 1737400)) * 180) / Math.PI - 90;
  const lon = (Math.atan2(x, y) * 180) / Math.PI;
  return { lat, lon };
}

function tile(values: number[]): ArrayBuffer {
  const bytes = new ArrayBuffer(values.length * 2);
  const view = new DataView(bytes);
  values.forEach((value, index) => view.setUint16(index * 2, value, true));
  return bytes;
}

describe('readMapLayers', () => {
  it('reads a valid description and refuses a broken one', () => {
    expect(manifest.layers.map((layer) => layer.id)).toEqual(['slope', 'elevation']);
    expect(readMapLayers({ ...RAW, version: 2 })).toBeNull();
    expect(readMapLayers({ ...RAW, layers: [{ ...RAW.layers[0], display: null }] })).toBeNull();
    expect(readMapLayers(undefined)).toBeNull();
  });
});

describe('locateValue', () => {
  it('uses the 40 m patch inside it and the 160 m base elsewhere', () => {
    const inPatch = locateValue(manifest, slope, pointAt(17, 2));
    expect(inPatch).toMatchObject({ kind: 'inside', level: { id: 'p1' }, col: 1, row: 2 });
    // Pixel (9, 6) at 40 m is base pixel (2, 1): tile (0, 0), position (2, 1).
    const inBase = locateValue(manifest, slope, pointAt(9, 6));
    expect(inBase).toMatchObject({ kind: 'inside', level: { id: 'base' }, col: 2, row: 1 });
  });

  it('is outside north of 80° S and off the raster', () => {
    expect(locateValue(manifest, slope, { lat: -79.9, lon: 0 })).toEqual({ kind: 'outside' });
    expect(locateValue(manifest, slope, { lat: -89.9, lon: 0 })).toEqual({ kind: 'outside' });
  });

  it('agrees with the projection used everywhere else', () => {
    const point = pointAt(3, 30);
    const { x, y } = toPolarXY(point);
    expect(x).toBeCloseTo(-640 + 3.5 * 40, 6);
    expect(y).toBeCloseTo(640 - 30.5 * 40, 6);
  });
});

describe('decodeStored', () => {
  it('keeps a stored 0 as a value and the NoData number as null', () => {
    const view = new DataView(tile([0, 1234, 65535]));
    const encoding = slope.values?.encoding;
    if (!encoding) throw new Error('no encoding');
    expect(decodeStored(view, 0, encoding)).toBe(0);
    expect(decodeStored(view, 1, encoding)).toBeCloseTo(12.34, 9);
    expect(decodeStored(view, 2, encoding)).toBeNull();
  });

  it('reads signed elevations', () => {
    const bytes = new ArrayBuffer(4);
    new DataView(bytes).setInt16(0, -4321, true);
    const encoding = { type: 'int16', scale: 1, offset: 0, nodata: -32768, unit: 'm' } as const;
    expect(decodeStored(new DataView(bytes), 0, encoding)).toBe(-4321);
  });
});

describe('layerValueAt', () => {
  const values = Array.from({ length: 16 }, (_, i) => (i === 5 ? 0 : i === 6 ? 65535 : i * 100));

  it('fetches only the tile the point is in, and caches it', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(tile(values)));
    // Base pixel (1, 1) → index 1 × 4 + 1 = 5: a valid 0°.
    const zero = await layerValueAt(slope, pointAt(5, 5), manifest, fetchImpl);
    expect(zero).toEqual({ kind: 'value', value: 0, unit: '°', levelId: 'base', pixelM: 160 });
    // Base pixel (2, 1) → index 6: NoData.
    expect(await layerValueAt(slope, pointAt(9, 6), manifest, fetchImpl)).toEqual({
      kind: 'nodata',
      levelId: 'base',
      pixelM: 160,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toMatch(
      /data\/layers\/slope\/values\/base\/0_0\.bin$/,
    );
  });

  it('says "no data" for a tile that was never written, without fetching it', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    // 40 m pixel (28, 12) is base pixel (7, 3): base tile (0, 1), which is not in the list.
    const result = await layerValueAt(slope, pointAt(28, 12), manifest, fetchImpl);
    expect(result).toMatchObject({ kind: 'nodata', levelId: 'base' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports a layer without values, and a failed tile, honestly', async () => {
    expect(await layerValueAt(elevation, pointAt(1, 1), manifest)).toEqual({
      kind: 'unavailable',
      reason: 'The values file supplied (elevation_40m.tif) is empty (0 bytes)',
    });
    const failing = vi.fn<typeof fetch>(async () => new Response('nope', { status: 404 }));
    expect(await layerValueAt(slope, pointAt(17, 1), manifest, failing)).toEqual({ kind: 'error' });
  });
});

// The real layers, when they have been built: every check point of scripts/data/make_map_layers.py
// (original TIFF value vs decoded tile) must come out the same through the app's own code.
const root = decodeURIComponent(new URL(import.meta.url).pathname)
  .replace(/^\/([A-Za-z]:)/, '$1')
  .replace(/tests\/unit\/services\/[^/]*$/, '');
const checkPath = `${root}src/data/layers/check.json`;

describe.runIf(MAP_LAYERS !== null && existsSync(checkPath))('the built layers', () => {
  interface Check {
    layer: string;
    label: string;
    lat: number;
    lon: number;
    level: string;
    original: number | null;
    decoded: number | null;
    pass: boolean;
  }
  const checks = JSON.parse(readFileSync(checkPath, 'utf8')) as Check[];
  const fromDisk = vi.fn<typeof fetch>(async (input) => {
    const path = String(input).replace(/^.*?data\/layers\//, `${root}public/data/layers/`);
    if (!existsSync(path)) return new Response('missing', { status: 404 });
    const bytes = readFileSync(path);
    return new Response(bytes.slice().buffer);
  });

  it('passed the script’s own check against the original rasters', () => {
    expect(checks.length).toBeGreaterThan(4);
    expect(checks.filter((check) => !check.pass)).toEqual([]);
  });

  it.each(checks.map((check) => [check.label, check] as const))(
    '%s reads the same value through the app',
    async (_label, check) => {
      const layer = MAP_LAYERS?.layers.find((entry) => entry.id === check.layer);
      if (!layer || !MAP_LAYERS) throw new Error('layer missing');
      const result = await layerValueAt(layer, check, MAP_LAYERS, fromDisk);
      if (check.level === 'outside') {
        expect(result.kind).toBe('outside');
      } else if (check.decoded === null) {
        expect(result.kind).toBe('nodata');
      } else {
        expect(result).toMatchObject({ kind: 'value', levelId: check.level });
        expect(result.kind === 'value' && result.value).toBeCloseTo(check.decoded, 6);
        // Within half the stored step of the original raster (0.005° slope, 0.5 m elevation).
        const halfStep = (layer.values?.encoding.scale ?? 0) / 2;
        if (check.original !== null) {
          expect(
            result.kind === 'value' && Math.abs(result.value - check.original),
          ).toBeLessThanOrEqual(halfStep + 1e-9);
        }
      }
    },
  );
});
