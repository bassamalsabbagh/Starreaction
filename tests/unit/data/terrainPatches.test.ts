import { describe, expect, it } from 'vitest';
import {
  TERRAIN_HORIZONS,
  terrainProfileFor,
  toHorizonProfile,
  usableHorizons,
} from '../../../src/data/terrainPatches';
import type { HorizonProfile } from '../../../src/utils/terrainShadow';

describe('usableHorizons', () => {
  // Made-up profiles: only their source labels matter here.
  const profile = (source: string): HorizonProfile => ({
    elevations: new Float32Array(360),
    radiusM: 1000,
    spacingM: 80,
    source,
  });
  const horizons = { a: profile('TEST: local only'), b: profile('LOLA (SRC-048)') };

  it('keeps every horizon while developing', () => {
    expect(Object.keys(usableHorizons(horizons, false))).toEqual(['a', 'b']);
  });

  it('never lets a production build use a TEST horizon', () => {
    expect(Object.keys(usableHorizons(horizons, true))).toEqual(['b']);
  });
});

describe('terrainProfileFor', () => {
  it('gives each site with a generated horizon that horizon, one value per degree', () => {
    for (const [siteId, profile] of Object.entries(TERRAIN_HORIZONS)) {
      expect(terrainProfileFor(siteId)).toBe(profile);
      expect(profile.elevations).toHaveLength(360);
      expect(profile.source.trim()).not.toBe('');
    }
  });

  it('gives sites without terrain data no horizon (a smooth Moon)', () => {
    // Blue Ghost Mission 1 landed at 18.6 N, far outside any south-polar elevation map.
    expect(terrainProfileFor('bg1')).toBeNull();
    expect(terrainProfileFor('no-such-site')).toBeNull();
  });
});

describe('toHorizonProfile', () => {
  // A made-up generated horizon: only its shape matters here.
  const base = { radiusM: 1000, spacingM: 80, source: 'TEST: made up for this test' };
  const cutEast = Array.from({ length: 360 }, (_, azimuth) =>
    azimuth >= 80 && azimuth <= 100 ? 1 : 0,
  );

  it('passes edgeCut through from a plain array or a typed array, as 0/1 bytes', () => {
    const fromArray = toHorizonProfile({
      ...base,
      elevations: new Array(360).fill(1),
      edgeCut: cutEast,
    });
    expect(fromArray.elevations).toBeInstanceOf(Float32Array);
    expect(fromArray.elevations).toHaveLength(360);
    expect(fromArray.edgeCut).toBeInstanceOf(Uint8Array);
    expect(fromArray.edgeCut).toHaveLength(360);
    expect(fromArray.edgeCut?.[90]).toBe(1);
    expect(fromArray.edgeCut?.[270]).toBe(0);
    const fromTyped = toHorizonProfile({
      ...base,
      elevations: new Float32Array(360),
      edgeCut: Uint8Array.from(cutEast),
    });
    expect(Array.from(fromTyped.edgeCut ?? [])).toEqual(cutEast);
  });

  it('leaves edgeCut out when the generated file has none, and keeps the rest', () => {
    const elevations = new Float32Array(360);
    const profile = toHorizonProfile({ ...base, elevations });
    expect(profile.edgeCut).toBeUndefined();
    expect(profile.elevations).toBe(elevations);
    expect(profile).toMatchObject(base);
  });
});
