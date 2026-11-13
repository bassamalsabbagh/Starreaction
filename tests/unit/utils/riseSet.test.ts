import { describe, expect, it } from 'vitest';
import { azimuthElevationOf, elevationOf, lunarSky } from '../../../src/utils/lunarSky';
import { bodyNow, forecastText, type PositionSamples } from '../../../src/utils/riseSet';
import { DAY_MS, HOUR_MS } from '../../../src/utils/time';

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

describe('forecastText', () => {
  const at = T + 2 * DAY_MS + 4 * HOUR_MS;

  it('words a sunset as dark, and the rest by name, with spaced units', () => {
    expect(forecastText('sun', { kind: 'set', at }, T)).toBe('Forecast: dark in 2 d 4 h');
    expect(forecastText('sun', { kind: 'rise', at }, T)).toBe('Forecast: Sun rises in 2 d 4 h');
    expect(forecastText('earth', { kind: 'set', at: T + DAY_MS + 6 * HOUR_MS }, T)).toBe(
      'Forecast: Earth sets in 1 d 6 h',
    );
    expect(forecastText('earth', { kind: 'rise', at: T + DAY_MS + 6 * HOUR_MS }, T)).toBe(
      'Forecast: Earth rises in 1 d 6 h',
    );
  });
});

describe('bodyNow with a site’s own samples (JPL Horizons)', () => {
  const STEP = 10 * 60_000;
  const START = Date.UTC(2026, 10, 15);

  /** Made-up samples every 10 minutes for `days`: the elevation `at(t)`, the azimuth fixed. */
  function samples(at: (t: number) => number, days: number): PositionSamples {
    const end = START + days * DAY_MS;
    return {
      startMs: START,
      stepMs: STEP,
      azEl: (_body, t) => (t < START || t > end ? null : { azimuth: 90, elevation: at(t) }),
    };
  }

  it('places the crossing by straight-line interpolation between the samples around it', () => {
    // Falling 1° an hour from 5°: it sets 5 hours after the start, between two samples.
    const falling = samples((t) => 5 - (t - START) / HOUR_MS, 3);
    const now = bodyNow(NEAR_SIDE, 'sun', START + 7 * 60_000, { positions: falling });
    expect(now.up).toBe(true);
    expect(now.elevationDeg).toBeCloseTo(5 - 7 / 60, 9);
    expect(now.azimuthDeg).toBe(90);
    expect(now.next).toEqual({ kind: 'set', at: START + 5 * HOUR_MS });
  });

  it('uses the engine outside the samples’ dates', () => {
    const early = samples(() => 10, 1);
    const later = START + 5 * DAY_MS;
    expect(bodyNow(NEAR_SIDE, 'sun', later, { positions: early })).toEqual(
      bodyNow(NEAR_SIDE, 'sun', later),
    );
  });

  it('agrees with the engine to about a minute, and hands over to it where the samples end', () => {
    const engine = (t: number) => azimuthElevationOf(lunarSky(new Date(t)).sun, NEAR_SIDE);
    const real = bodyNow(NEAR_SIDE, 'sun', T);
    if (!real.next) throw new Error('the Sun sets or rises within a lunar day here');
    const full = bodyNow(NEAR_SIDE, 'sun', T, {
      positions: { startMs: START, stepMs: STEP, azEl: (_body, t) => engine(t) },
    });
    expect(Math.abs((full.next?.at ?? 0) - real.next.at)).toBeLessThan(2 * 60_000);
    // Samples for one day only: the engine finds the crossing after that.
    const short = bodyNow(NEAR_SIDE, 'sun', T, {
      positions: {
        startMs: START,
        stepMs: STEP,
        azEl: (_body, t) => (t <= T + DAY_MS ? engine(t) : null),
      },
    });
    expect(real.next.at - T).toBeGreaterThan(DAY_MS);
    expect(Math.abs((short.next?.at ?? 0) - real.next.at)).toBeLessThan(2 * 60_000);
  });
});
