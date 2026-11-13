import { describe, expect, it } from 'vitest';
import {
  TERRAIN_HORIZONS,
  terrainProfileFor,
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
    // Demo Site Alpha is near the equator, far outside any south-polar elevation map.
    expect(terrainProfileFor('demo-site-alpha')).toBeNull();
    expect(terrainProfileFor('no-such-site')).toBeNull();
  });
});
