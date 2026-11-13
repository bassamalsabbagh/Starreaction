import { describe, expect, it } from 'vitest';
import { elevationOf, lunarSky } from '../../../src/utils/lunarSky';
import { bodyNow } from '../../../src/utils/riseSet';
import { DAY_MS } from '../../../src/utils/time';

const T = Date.parse('2026-11-15T12:00:00Z');
const NEAR_SIDE = { lat: 12.4, lon: -31.8 };

describe('bodyNow', () => {
  it('gives the elevation now, as lunarSky does', () => {
    const sun = bodyNow(NEAR_SIDE, 'sun', T);
    expect(sun.elevationDeg).toBeCloseTo(elevationOf(lunarSky(new Date(T)).sun, NEAR_SIDE), 9);
    expect(sun.up).toBe(sun.elevationDeg >= 0);
    expect(sun.azimuthDeg).toBeGreaterThanOrEqual(0);
    expect(sun.azimuthDeg).toBeLessThan(360);
  });

  it('finds the next sunset or sunrise to the minute, where the elevation crosses 0°', () => {
    const sun = bodyNow(NEAR_SIDE, 'sun', T);
    const next = sun.next;
    if (!next) throw new Error('the Sun always sets or rises within a lunar day here');
    expect(next.kind).toBe(sun.up ? 'set' : 'rise');
    expect(next.at).toBeGreaterThan(T);
    expect(next.at - T).toBeLessThan(16 * DAY_MS);
    const just = (ms: number) => elevationOf(lunarSky(new Date(ms)).sun, NEAR_SIDE);
    // A minute before, it is still on its side of the horizon; at the crossing, it has gone over.
    expect(just(next.at - 120_000) >= 0).toBe(sun.up);
    expect(just(next.at) >= 0).toBe(!sun.up);
  });

  it('never sees the Earth set on the near side: it stays up for the whole search', () => {
    const earth = bodyNow(NEAR_SIDE, 'earth', T);
    expect(earth.up).toBe(true);
    expect(earth.next).toBeNull();
  });

  it('never sees the Earth rise on the far side', () => {
    const earth = bodyNow({ lat: 0, lon: 180 }, 'earth', T);
    expect(earth.up).toBe(false);
    expect(earth.next).toBeNull();
  });
});
