import { describe, expect, it } from 'vitest';
import { SOUTH_POLE, formatKm, haversineKm } from '../../../src/utils/distance';
import { greatCircleKm } from '../../../src/utils/lunarSky';

const IM1 = { lat: -80.13, lon: 1.44 };

describe('haversineKm (team equation sheet 2.1, R = 1737.4 km)', () => {
  it('gives IM-1 to the south pole as 299.3 km (sheet 1.4: d = R·c)', () => {
    expect(haversineKm(IM1, SOUTH_POLE)).toBeCloseTo(299.3, 1);
    expect(Math.abs(haversineKm(IM1, SOUTH_POLE) - 299.3)).toBeLessThan(0.1);
  });

  it('gives IM-1 to IM-2’s intended site (84.78° S, 29.13° E) as 175.2 km (sheet 2.3)', () => {
    expect(Math.abs(haversineKm(IM1, { lat: -84.78, lon: 29.13 }) - 175.2)).toBeLessThan(0.1);
  });

  it('is zero from a place to itself, the same both ways, and matches greatCircleKm', () => {
    const a = { lat: 18.5623, lon: 61.8103 };
    const b = { lat: -69.3741, lon: 32.32 };
    expect(haversineKm(a, a)).toBe(0);
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 9);
    expect(haversineKm(a, b)).toBeCloseTo(greatCircleKm(a, b), 6);
  });

  it('formats to one decimal', () => {
    expect(formatKm(299.34)).toBe('299.3 km');
    expect(formatKm(2724)).toBe('2,724.0 km');
  });
});
