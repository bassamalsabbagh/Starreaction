import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  SHADE_EVERYWHERE,
  defaultActiveLayer,
  previewsOnly,
  unshadedBelowZ,
  formatLayerValue,
  layerDisplays,
  layerImagePlan,
  legendScale,
  readingStatus,
  readoutText,
} from '../../../../src/features/lunar-map/mapLayerState';
import { MAP_LAYERS, layerValueAt, type MapLayer } from '../../../../src/services/mapLayers';

/** A made-up layer for these tests only (not the team's data). */
function layer(overrides: Partial<MapLayer> = {}): MapLayer {
  const image = (file: string) => ({ file, west: -180, east: -90, south: -90, north: -80 });
  return {
    id: 'slope',
    label: 'Slope',
    unit: '°',
    values: {
      encoding: { type: 'uint16', scale: 0.01, offset: 0, nodata: 65535, unit: '°' },
      levels: [],
    },
    valuesUnavailable: null,
    display: {
      preview: [image('preview-q0.png')],
      base: [image('base-q0.png'), image('base-q1.png')],
      patches: [{ ...image('im1.png'), id: 'im1' }],
    },
    legend: {
      stops: [
        { value: 0, color: '#000000' },
        { value: 10, color: '#888888' },
        { value: 80, color: '#ffffff' },
      ],
      min: 0,
      max: 80,
    },
    ...overrides,
  };
}

const ELEVATION = layer({
  id: 'elevation',
  label: 'Elevation',
  unit: 'm',
  values: {
    encoding: { type: 'int16', scale: 1, offset: 0, nodata: -32768, unit: 'm' },
    levels: [],
  },
});
const NO_VALUES = layer({
  id: 'elevation',
  label: 'Elevation',
  unit: 'm',
  values: null,
  valuesUnavailable: 'The values file supplied (elevation_40m.tif) is empty (0 bytes)',
});
const url = (id: string, path: string) => `/data/layers/${id}/${path}`;

describe('the map layers’ images', () => {
  it('draws the previews first, then the full quarters, then the 40 m patches on top', () => {
    const plan = layerImagePlan(layer(), url);
    expect(plan.preview.map((image) => image.url)).toEqual([
      '/data/layers/slope/display/preview-q0.png',
    ]);
    expect(plan.full.map((image) => image.key)).toEqual([
      'slope/base-q0.png',
      'slope/base-q1.png',
      'slope/im1.png',
    ]);
    expect(plan.full[0]).toMatchObject({ west: -180, east: -90, south: -90, north: -80 });
  });

  it('lists the layers in the manifest’s order (the first lowest), off until switched on', () => {
    const displays = layerDisplays(
      [NO_VALUES, layer()],
      { slope: { visible: true, opacity: 0.5 } },
      url,
    );
    expect(displays.map((display) => [display.id, display.visible, display.opacity])).toEqual([
      ['elevation', false, 0.8],
      ['slope', true, 0.5],
    ]);
  });
});

describe('the layer readings come from', () => {
  const layers = [NO_VALUES, layer()];
  const on = { visible: true, opacity: 0.8 };

  it('is the most recently switched-on layer that has values', () => {
    expect(defaultActiveLayer(layers, ['slope', 'elevation'], { slope: on, elevation: on })).toBe(
      'slope',
    );
    expect(defaultActiveLayer(layers, ['elevation'], { elevation: on })).toBe('elevation');
    expect(defaultActiveLayer(layers, ['slope'], { slope: { ...on, visible: false } })).toBeNull();
  });
});

describe('the readout', () => {
  it('reads a value at the stored precision, with its unit and resolution; a 0 stays a value', () => {
    expect(
      readoutText(layer(), { kind: 'value', value: 12.28, unit: '°', levelId: 'im1', pixelM: 40 }),
    ).toBe('Slope 12.28° · 40 m');
    expect(
      readoutText(layer(), { kind: 'value', value: 0, unit: '°', levelId: 'base', pixelM: 160 }),
    ).toBe('Slope 0.00° · 160 m');
    expect(formatLayerValue(ELEVATION, -1234)).toBe('-1234 m');
  });

  it('says no data, outside, unavailable and load failures in words', () => {
    expect(readoutText(layer(), { kind: 'nodata', levelId: 'base', pixelM: 160 })).toBe('No data');
    expect(readoutText(layer(), { kind: 'outside' })).toBe(
      'No data here: this tool covers 80° S to the pole',
    );
    expect(readoutText(NO_VALUES, { kind: 'unavailable', reason: 'The file is empty' })).toBe(
      'Unavailable: The file is empty',
    );
    expect(readoutText(layer(), { kind: 'error' })).toBe('Couldn’t load this value');
  });

  it('tags 40 m values Real data and 160 m values Calculated (the mean of 4 × 4 pixels)', () => {
    const value = (pixelM: number) =>
      ({ kind: 'value', value: 1, unit: '°', levelId: 'x', pixelM }) as const;
    expect(readingStatus(value(40))).toBe('Real data');
    expect(readingStatus(value(160))).toBe('Calculated');
    expect(readingStatus({ kind: 'outside' })).toBeNull();
  });
});

describe('the legend', () => {
  it('places each colour at its value along the bar, and labels without crowding', () => {
    const scale = legendScale({
      stops: [
        { value: 0, color: '#000000' },
        { value: 5, color: '#111111' },
        { value: 40, color: '#888888' },
        { value: 80, color: '#ffffff' },
      ],
      min: 0,
      max: 80,
    });
    expect(scale.gradient).toBe(
      'linear-gradient(to right, #000000 0.00%, #111111 6.25%, #888888 50.00%, #ffffff 100.00%)',
    );
    // 5 is too close to 0 (6.25%) to get its own label.
    expect(scale.ticks).toEqual([
      { at: 0, value: 0 },
      { at: 0.5, value: 40 },
      { at: 1, value: 80 },
    ]);
  });
});

// The team's real files, read from disk the way the browser fetches them.
const root = decodeURIComponent(new URL(import.meta.url).pathname)
  .replace(/^\/([A-Za-z]:)/, '$1')
  .replace(/tests\/unit\/features\/lunar-map\/[^/]*$/, '');

describe.runIf(MAP_LAYERS !== null && existsSync(`${root}public/data/layers`))(
  'the readout on the team’s rasters (docs/LAYER_CHECK.md)',
  () => {
    const fromDisk = vi.fn<typeof fetch>(async (input) => {
      const path = String(input).replace(/^.*?data\/layers\//, `${root}public/data/layers/`);
      if (!existsSync(path)) return new Response('missing', { status: 404 });
      return new Response(readFileSync(path).slice().buffer);
    });
    const read = async (id: string, lat: number, lon: number) => {
      const found = MAP_LAYERS?.layers.find((entry) => entry.id === id);
      if (!found) throw new Error(`no layer ${id}`);
      return readoutText(found, await layerValueAt(found, { lat, lon }, MAP_LAYERS, fromDisk));
    };

    it.each([
      ['IM-1, in its 40 m patch', -80.13, 1.44, 'Slope 12.28° · 40 m'],
      ['IM-2, in its 40 m patch', -84.7906, 29.1957, 'Slope 2.62° · 40 m'],
      ['near the pole', -89.99, 45, 'Slope 9.75° · 160 m'],
      ['80.5° S, 180° E', -80.5, 180, 'Slope 4.84° · 160 m'],
      ['79.5° S, outside', -79.5, 0, 'No data here: this tool covers 80° S to the pole'],
    ])('slope at %s reads "%s"', async (_label, lat, lon, expected) => {
      expect(await read('slope', lat, lon)).toBe(expected);
    });

    it.each([
      ['IM-1, in its 40 m patch', -80.13, 1.44, 'Elevation 2592 m · 40 m'],
      ['IM-2, in its 40 m patch', -84.7906, 29.1957, 'Elevation 5323 m · 40 m'],
      ['near the pole', -89.99, 45, 'Elevation 1281 m · 160 m'],
      ['80.5° S, 180° E (below the reference sphere)', -80.5, 180, 'Elevation -3466 m · 160 m'],
      ['85° S, 90° W', -85, -90, 'Elevation -2298 m · 160 m'],
      ['79.5° S, outside', -79.5, 0, 'No data here: this tool covers 80° S to the pole'],
    ])('elevation at %s reads "%s"', async (_label, lat, lon, expected) => {
      expect(await read('elevation', lat, lon)).toBe(expected);
    });
  },
);

describe('the globe’s shading under the layers', () => {
  it('stops south of 80° S while a layer is visible, and shades the whole Moon otherwise', () => {
    expect(unshadedBelowZ([{ visible: false }, { visible: true }], -80)).toBeCloseTo(-0.9848, 4);
    expect(unshadedBelowZ([{ visible: false }], -80)).toBe(SHADE_EVERYWHERE);
    expect(unshadedBelowZ([], -80)).toBe(-2);
  });
});

describe('previews only on small devices', () => {
  it('keeps the 512 px previews under 900 px wide or with 4 GB of memory or less', () => {
    expect(previewsOnly(899, undefined)).toBe(true);
    expect(previewsOnly(1366, 4)).toBe(true);
    expect(previewsOnly(1366, 8)).toBe(false);
    expect(previewsOnly(1366, undefined)).toBe(false);
    const displays = layerDisplays([layer()], { slope: { visible: true, opacity: 1 } }, url, true);
    expect(displays[0]?.preview).toHaveLength(1);
    expect(displays[0]?.full).toEqual([]);
  });
});
