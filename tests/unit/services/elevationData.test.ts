import { describe, expect, it, vi } from 'vitest';
import { ELEVATION_MANIFEST, loadElevationGrid } from '../../../src/services/elevationData';
import type { ElevationManifest } from '../../../src/utils/elevationGrid';

// A made-up description for these tests only (no real file exists yet).
const MANIFEST: ElevationManifest = {
  version: 1,
  file: 'test-only.f32',
  format: 'float32-le',
  width: 3,
  height: 3,
  pixelSizeM: 100,
  originX: -100,
  originY: 100,
  projection: { kind: 'polar-stereographic-south', radiusM: 1_737_400, centralLonDeg: 0, scale: 1 },
  heights: { unit: 'm', reference: 'sphere 1737400 m' },
  maxLatDeg: -89.99,
  source: { id: 'SRC-999', title: 'Made-up test grid', file: 'none', nativePixelM: 100 },
};

const reply = (bytes: number, status = 200) =>
  vi.fn<typeof fetch>(async () => new Response(new ArrayBuffer(bytes), { status }));

describe('loadElevationGrid', () => {
  it('has no description in the project yet, so nothing is fetched', async () => {
    expect(ELEVATION_MANIFEST).toBeNull();
    const fetchImpl = reply(36);
    expect(await loadElevationGrid(null, fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('loads heights whose size matches the description', async () => {
    const fetchImpl = reply(3 * 3 * 4);
    const grid = await loadElevationGrid({ ...MANIFEST }, fetchImpl);
    expect(grid?.heights).toHaveLength(9);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toMatch(/data\/elevation\/test-only\.f32$/);
  });

  it('refuses a file of the wrong size, or a missing one', async () => {
    expect(await loadElevationGrid({ ...MANIFEST }, reply(8))).toBeNull();
    expect(await loadElevationGrid({ ...MANIFEST }, reply(36, 404))).toBeNull();
  });
});
