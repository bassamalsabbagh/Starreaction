import { describe, expect, it } from 'vitest';
import {
  SUN_RADIUS_KM,
  angularRadiusDeg,
  azimuthElevationOf,
  distanceFromSite,
  elevationOf,
  lunarSky,
} from '../../../src/utils/lunarSky';
import { bodyNow, forecastText, type PositionSamples } from '../../../src/utils/riseSet';
import { skyAtHour } from '../../../src/utils/skyVisibility';
import { DAY_MS, HOUR_MS } from '../../../src/utils/time';

const T = Date.parse('2026-11-15T12:00:00Z');
const NEAR_SIDE = { lat: 12.4, lon: -31.8 };

/** The Sun's upper limb above NEAR_SIDE's flat horizon at `ms`, degrees. */
function sunLimb(ms: number): number {
  const sun = lunarSky(new Date(ms)).sun;
  return (
    elevationOf(sun, NEAR_SIDE) + angularRadiusDeg(SUN_RADIUS_KM, distanceFromSite(sun, NEAR_SIDE))
  );
}

describe('bodyNow', () => {
  it('gives the centre’s elevation now, as lunarSky does, and "up" by the upper limb', () => {
    const sun = bodyNow(NEAR_SIDE, 'sun', T);
    expect(sun.elevationDeg).toBeCloseTo(elevationOf(lunarSky(new Date(T)).sun, NEAR_SIDE), 9);
    expect(sun.up).toBe(sunLimb(T) > 0);
    expect(sun.azimuthDeg).toBeGreaterThanOrEqual(0);
    expect(sun.azimuthDeg).toBeLessThan(360);
  });

  it('finds the next sunset or sunrise to the minute, where the upper limb crosses 0°', () => {
    const sun = bodyNow(NEAR_SIDE, 'sun', T);
    const next = sun.next;
    if (!next) throw new Error('the Sun always sets or rises within a lunar day here');
    expect(next.kind).toBe(sun.up ? 'set' : 'rise');
    expect(next.at).toBeGreaterThan(T);
    expect(next.at - T).toBeLessThan(16 * DAY_MS);
    // A minute before, the limb is still on its side of the horizon; at the crossing, it has gone
    // over.
    expect(sunLimb(next.at - 120_000) > 0).toBe(sun.up);
    expect(sunLimb(next.at) > 0).toBe(!sun.up);
    // At a sunset the centre is already about the Sun's radius (0.27°) below the horizon; at a
    // sunrise the centre is still that far below it. Either way the centre is below 0°.
    const centre = elevationOf(lunarSky(new Date(next.at)).sun, NEAR_SIDE);
    expect(centre).toBeLessThan(-0.2);
    expect(centre).toBeGreaterThan(-0.35);
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

  it('places the crossing of the upper limb by straight-line interpolation between samples', () => {
    // Falling 1° an hour from 5°: the centre reaches 0° 5 hours after the start, and the upper
    // limb a Sun's radius later (the radius from our engine's distance for that hour).
    const falling = samples((t) => 5 - (t - START) / HOUR_MS, 3);
    const now = bodyNow(NEAR_SIDE, 'sun', START + 7 * 60_000, { positions: falling });
    expect(now.up).toBe(true);
    expect(now.elevationDeg).toBeCloseTo(5 - 7 / 60, 9);
    expect(now.azimuthDeg).toBe(90);
    const sun = skyAtHour(START / HOUR_MS + 5).sun;
    const radius = angularRadiusDeg(SUN_RADIUS_KM, distanceFromSite(sun, NEAR_SIDE));
    expect(radius).toBeGreaterThan(0.26);
    expect(radius).toBeLessThan(0.28);
    expect(now.next?.kind).toBe('set');
    expect(Math.abs((now.next?.at ?? 0) - (START + (5 + radius) * HOUR_MS))).toBeLessThan(1000);
  });

  it('sees a body with its centre at −0.1° as up, and the centre rule would not', () => {
    const grazing = samples(() => -0.1, 1);
    const now = bodyNow(NEAR_SIDE, 'sun', START, { positions: grazing });
    expect(now.up).toBe(true);
    expect(now.elevationDeg).toBeCloseTo(-0.1, 9);
    expect(bodyNow(NEAR_SIDE, 'sun', START, { positions: samples(() => -0.4, 1) }).up).toBe(false);
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
