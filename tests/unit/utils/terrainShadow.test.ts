import { describe, expect, it } from 'vitest';
import { azimuthElevationOf } from '../../../src/utils/lunarSky';
import {
  horizonAt,
  horizonProfile,
  terrainIllumination,
  type TerrainPatch,
} from '../../../src/utils/terrainShadow';

const SIZE = 41; // 40 cells of 10 m: terrain known out to 190 m
const SPACING = 10;

/** Level ground with a wall of the given height across the whole east side (5+ cells east). */
function patchWithEastWall(wallHeightM: number): TerrainPatch {
  const heights = new Float32Array(SIZE * SIZE);
  const centre = (SIZE - 1) / 2;
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (col >= centre + 5) heights[row * SIZE + col] = wallHeightM;
    }
  }
  return { heights, size: SIZE, spacingM: SPACING, source: 'test fixture (not real terrain)' };
}

describe('horizonProfile', () => {
  it('is level (0°, a hair below from the Moon’s curvature) over flat ground', () => {
    const profile = horizonProfile(patchWithEastWall(0));
    for (const azimuth of [0, 90, 180, 270]) {
      expect(horizonAt(profile, azimuth)).toBeLessThanOrEqual(0);
      expect(horizonAt(profile, azimuth)).toBeGreaterThan(-0.1);
    }
    expect(profile.radiusM).toBe(190);
    expect(profile.spacingM).toBe(10);
  });

  it('raises the horizon towards a wall: 50 m high, 50 m away is 45°', () => {
    const profile = horizonProfile(patchWithEastWall(50));
    expect(horizonAt(profile, 90)).toBeGreaterThan(44);
    expect(horizonAt(profile, 90)).toBeLessThan(46);
    // The wall is east only: the west horizon stays level.
    expect(horizonAt(profile, 270)).toBeLessThanOrEqual(0);
  });
});

describe('terrainIllumination', () => {
  const profile = horizonProfile(patchWithEastWall(50)); // a 45° wall to the east

  it('is lit when the Sun is clear of the terrain horizon', () => {
    expect(terrainIllumination(profile, { azimuth: 90, elevation: 60 }).status).toBe('lit');
  });

  it('is blocked when the Sun is behind terrain', () => {
    expect(terrainIllumination(profile, { azimuth: 90, elevation: 20 }).status).toBe('blocked');
    // The same height in the open west is clear.
    expect(terrainIllumination(profile, { azimuth: 270, elevation: 20 }).status).toBe('lit');
  });

  it('says the Sun is below the smooth horizon at night', () => {
    expect(terrainIllumination(profile, { azimuth: 90, elevation: -5 }).status).toBe(
      'sun-below-horizon',
    );
  });

  it('never treats missing terrain data as lit', () => {
    expect(terrainIllumination(null, { azimuth: 90, elevation: 60 })).toEqual({
      status: 'no-data',
    });
  });
});

describe('azimuthElevationOf', () => {
  it('puts a body due east of the site at azimuth 90°', () => {
    const seen = azimuthElevationOf([1737.4, 1e6, 0], { lat: 0, lon: 0 });
    expect(seen.azimuth).toBeCloseTo(90, 2);
    expect(seen.elevation).toBeCloseTo(0, 1);
  });

  it('puts the pole direction at azimuth 0° and straight up at elevation 90°', () => {
    expect(azimuthElevationOf([1737.4, 0, 1e6], { lat: 0, lon: 0 }).azimuth).toBeCloseTo(0, 2);
    expect(azimuthElevationOf([1e6, 0, 0], { lat: 0, lon: 0 }).elevation).toBeCloseTo(90, 1);
  });
});
