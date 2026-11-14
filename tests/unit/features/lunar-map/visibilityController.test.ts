// A Vitest port of the team's mocked check (visibility_cap_cesium_ready/integration/
// test_cesium_controller.mjs), run against the vendored controller. Cesium and the viewer are
// stand-ins, so this is not a browser integration test.
import type * as Cesium from 'cesium';
import type { Viewer } from 'cesium';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CesiumVisibilityController } from '../../../../src/features/lunar-map/visibility/cesium-visibility-controller.mjs';
import {
  IDLE_RUNTIME,
  visibilityReadout,
} from '../../../../src/features/lunar-map/visibilityLayer';

const TIMES = ['2026-11-24T00:00:00Z', '2026-11-24T00:10:00Z'];
const fileStamp = (time: string) => time.replace(/[-:]/g, '');
const FRAMES = TIMES.flatMap((time) =>
  (['sun', 'earth'] as const).map((target) => ({
    target,
    time_utc: time,
    image: `${target}_${fileStamp(time)}.png`,
    numerical: `${target}_${fileStamp(time)}.json`,
    rectangle_degrees: [-180, -90, 180, -80],
  })),
);
const MANIFEST = { frames: FRAMES, colors: { 0: '#000000', 1: '#ffffff' } };
// A made-up 3 × 3 grid: only the centre cell (the pole) is 0.25; the rest are 0 (valid data).
const GRID = {
  width: 3,
  height: 3,
  radius_m: 1737400,
  source_pixel_spacing_m: 1,
  nodata: -9999,
  units: 'fraction',
  geotransform: [-1.5, 1, 0, 1.5, 0, -1],
  values: [0, 0, 0, 0, 0.25, 0, 0, 0, 0],
};

interface FakeLayer {
  provider: { url: string };
  show?: boolean;
  alpha?: number;
}

let failEarth = false;

function setup() {
  const basemap: FakeLayer = { provider: { url: 'existing map' } };
  const active: FakeLayer[] = [basemap];
  const C = {
    Rectangle: { fromDegrees: (...values: number[]) => values },
    Ellipsoid: { MOON: { maximumRadius: 1737400 } },
    SingleTileImageryProvider: {
      fromUrl: async (url: string, options: unknown) => {
        // The second frame's images arrive late, so a newer request can overtake it.
        if (url.includes('001000Z')) await new Promise((resolve) => setTimeout(resolve, 30));
        if (failEarth && url.includes('earth_')) throw new Error('Deliberate provider failure');
        return { url, options };
      },
    },
  };
  const viewer = {
    scene: { globe: { ellipsoid: { maximumRadius: 1737400 } }, requestRender: vi.fn() },
    imageryLayers: {
      addImageryProvider(provider: { url: string }) {
        const layer: FakeLayer = { provider };
        active.push(layer);
        return layer;
      },
      remove(layer: FakeLayer) {
        const index = active.indexOf(layer);
        if (index >= 0) active.splice(index, 1);
      },
    },
  };
  const applied: string[] = [];
  const create = () =>
    CesiumVisibilityController.create(
      C as unknown as typeof Cesium,
      viewer as unknown as Viewer,
      'http://local/assets/manifest.json',
      (time) => applied.push(time),
    );
  return { basemap, active, create, applied };
}

/** The controller's own layers (not in its declared type). */
const ownLayers = (controller: CesiumVisibilityController) =>
  (controller as unknown as { layers: Partial<Record<'sun' | 'earth', FakeLayer>> }).layers;

describe('CesiumVisibilityController (mocked Cesium)', () => {
  beforeEach(() => {
    failEarth = false;
    vi.stubGlobal('fetch', async (url: URL | string) => ({
      ok: true,
      json: async () => (String(url).endsWith('manifest.json') ? MANIFEST : GRID),
    }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists the supported times and adds one layer per target above the basemap', async () => {
    const { active, basemap, create, applied } = setup();
    const controller = await create();
    expect(controller.supportedTimes).toEqual(TIMES);
    expect(await controller.setTime(TIMES[0] ?? '')).toBe(true);
    expect(active).toHaveLength(3);
    expect(active[0]).toBe(basemap);
    expect(applied).toEqual([TIMES[0]]);
    // Sun on and Earth off at first.
    expect(ownLayers(controller).sun?.show).toBe(true);
    expect(ownLayers(controller).earth?.show).toBe(false);
  });

  it('samples the numerical grid, and nothing north of 80° S', async () => {
    const { create } = setup();
    const controller = await create();
    expect(controller.sample('sun', 0, -90)).toBeNull(); // no frame applied yet
    await controller.setTime(TIMES[0] ?? '');
    expect(controller.sample('sun', 0, -90)?.fraction).toBe(0.25);
    expect(controller.sample('sun', 0, -90)?.timeUTC).toBe(TIMES[0]);
    expect(controller.sample('sun', 0, -79)).toBeNull();
  });

  it('applies switches and opacity to its layers', async () => {
    const { create } = setup();
    const controller = await create();
    await controller.setTime(TIMES[0] ?? '');
    controller.setVisible('earth', true);
    controller.setOpacity('earth', 0.4);
    expect(ownLayers(controller).earth?.show).toBe(true);
    expect(ownLayers(controller).earth?.alpha).toBe(0.4);
    controller.setVisible('sun', false);
    expect(ownLayers(controller).sun?.show).toBe(false);
    expect(() => controller.setOpacity('sun', 1.5)).toThrow(/between 0 and 1/);
  });

  it('drops a slower, older load when a newer one lands first', async () => {
    const { active, create, applied } = setup();
    const controller = await create();
    await controller.setTime(TIMES[0] ?? '');
    const slow = controller.setTime(TIMES[1] ?? '');
    const recent = controller.setTime(TIMES[0] ?? '');
    expect(await recent).toBe(true);
    expect(await slow).toBe(false);
    expect(controller.sample('sun', 0, -90)?.timeUTC).toBe(TIMES[0]);
    expect(active).toHaveLength(3);
    expect(applied).toEqual([TIMES[0], TIMES[0]]);
  });

  it('keeps the old layers until both new ones are ready', async () => {
    const { active, create } = setup();
    const controller = await create();
    await controller.setTime(TIMES[0] ?? '');
    const oldSun = ownLayers(controller).sun;
    const loading = controller.setTime(TIMES[1] ?? '');
    // While the new pair loads, the old pair is still on the globe.
    expect(active).toContain(oldSun);
    expect(await loading).toBe(true);
    expect(active).not.toContain(oldSun);
    expect(active).toHaveLength(3);

    failEarth = true;
    const kept = ownLayers(controller).sun;
    await expect(controller.setTime(TIMES[0] ?? '')).rejects.toThrow(/Deliberate/);
    expect(ownLayers(controller).sun).toBe(kept);
    expect(active).toHaveLength(3);
    expect(controller.sample('sun', 0, -90)?.timeUTC).toBe(TIMES[1]);
  });

  it('accepts only supplied 10-minute times with an explicit zone', async () => {
    const { create } = setup();
    const controller = await create();
    await expect(controller.setTime('2026-11-24T00:05:00Z')).rejects.toThrow(/supported/);
    await expect(controller.setTime('2026-11-24T00:00')).rejects.toThrow(/timezone/);
  });

  it('removes only its own layers on dispose, and refuses work afterwards', async () => {
    const { active, basemap, create } = setup();
    const controller = await create();
    await controller.setTime(TIMES[0] ?? '');
    controller.dispose();
    expect(active).toEqual([basemap]);
    expect(controller.sample('sun', 0, -90)).toBeNull();
    await expect(controller.setTime(TIMES[0] ?? '')).rejects.toThrow(/disposed/);
  });

  it('reads 0 % and a partial value at a supported time, unchanged by the new palettes', async () => {
    const { create } = setup();
    const controller = await create();
    await controller.setTime(TIMES[1] ?? '');
    const readAt = (lon: number, lat: number) =>
      visibilityReadout({
        runtime: { ...IDLE_RUNTIME, status: 'ready', appliedTime: TIMES[1] ?? null },
        frame: TIMES[1] ?? null,
        hasPoint: true,
        sample: controller.sample('earth', lon, lat),
      });
    // The pole cell holds 0.25; the cells round it hold 0 (valid, not NoData).
    expect(readAt(0, -90)).toEqual({
      main: 'Approx. visible disc: 25 %',
      detail: '9.6 km grid · 2026-11-24 00:10 UTC',
    });
    expect(readAt(0, -89.99997).main).toBe('Approx. visible disc: 0 %');
    expect(readAt(0, -79).main).toBe('No data');
  });

  it('rejects when the manifest cannot be read', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 404, json: async () => ({}) }));
    const { create } = setup();
    await expect(create()).rejects.toThrow(/manifest failed: 404/);
  });
});
