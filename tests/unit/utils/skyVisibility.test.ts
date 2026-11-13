import { describe, expect, it } from 'vitest';
import { azimuthElevationOf, earthElevation, sunElevation } from '../../../src/utils/lunarSky';
import {
  bestWindow,
  hourlySky,
  longestDarkHours,
  longestRun,
  mergeRuns,
  sampledSpan,
  siteSky,
  type SkySample,
} from '../../../src/utils/skyVisibility';
import { horizonAt, type HorizonProfile } from '../../../src/utils/terrainShadow';
import { DAY_MS, HOUR_MS, dayCentre, rangeAround } from '../../../src/utils/time';

const NOV_15 = rangeAround(dayCentre(Date.parse('2026-11-15T09:30:00Z')));
const THRESHOLDS = { minSunElevationDeg: 5, minEarthElevationDeg: 5 };
const SOUTH_POLE_SITE = { lat: -85.5, lon: 31 };

describe('hourlySky', () => {
  it('samples every whole hour of the 29.5-day range', () => {
    const samples = hourlySky(NOV_15);
    expect(samples).toHaveLength(708);
    expect(samples.every((sample) => sample.t % HOUR_MS === 0)).toBe(true);
    expect(samples[0]?.t).toBeGreaterThanOrEqual(NOV_15.start);
    expect(samples[samples.length - 1]?.t).toBeLessThan(NOV_15.end);
  });

  it('reuses its samples when the range slides by a day', () => {
    const next = { start: NOV_15.start + DAY_MS, end: NOV_15.end + DAY_MS };
    const a = hourlySky(NOV_15);
    const b = hourlySky(next);
    expect(b[0]?.sun).toBe(a[24]?.sun);
  });
});

describe('mergeRuns', () => {
  it('merges consecutive true samples into intervals and cuts the last at the end', () => {
    const times = [0, 1, 2, 3, 4, 5].map((h) => h * HOUR_MS);
    const flags = [true, true, false, true, false, true];
    expect(mergeRuns(times, flags, 5.5 * HOUR_MS)).toEqual([
      // Up from the first sample, and to the last: the true start and end are not known.
      { start: 0, end: 2 * HOUR_MS, openStart: true },
      { start: 3 * HOUR_MS, end: 4 * HOUR_MS },
      { start: 5 * HOUR_MS, end: 5.5 * HOUR_MS, openEnd: true },
    ]);
    expect(
      mergeRuns(
        times,
        times.map(() => true),
        6 * HOUR_MS,
      ),
    ).toEqual([{ start: 0, end: 6 * HOUR_MS, openStart: true, openEnd: true }]);
    expect(mergeRuns([], [], 0)).toEqual([]);
  });
});

describe('longest sunlit stretch', () => {
  it('finds the longest run of consecutive hours', () => {
    expect(longestRun([true, true, false, true, true, true, false, true])).toBe(3);
    expect(longestRun([false, false])).toBe(0);
    expect(longestRun([])).toBe(0);
  });

  it('measures it in days, inside the range only', () => {
    // At 0° N 0° E: the Sun straight overhead (up) or straight below (down), Earth irrelevant.
    const up = [1e8, 0, 0] as const;
    const down = [-1e8, 0, 0] as const;
    const pattern = [...Array(30).fill(up), ...Array(5).fill(down), ...Array(40).fill(up)];
    const samples: SkySample[] = pattern.map((sun, hour) => ({
      t: hour * HOUR_MS,
      sun,
      earth: up,
    }));
    const all = { start: 0, end: 75 * HOUR_MS };
    expect(siteSky(samples, { lat: 0, lon: 0 }, THRESHOLDS, all).longestSunlitDays).toBeCloseTo(
      40 / 24,
      10,
    );
    // A range that cuts the 40-hour run at hour 50 counts only the 15 hours inside it.
    const cut = { start: 0, end: 50 * HOUR_MS };
    expect(siteSky(samples, { lat: 0, lon: 0 }, THRESHOLDS, cut).longestSunlitDays).toBeCloseTo(
      30 / 24,
      10,
    );
  });
});

describe('landing windows', () => {
  // At 0° N 0° E for 10 hours: the Sun up throughout, the Earth up for the first 4 only.
  const up = [1e8, 0, 0] as const;
  const down = [-1e8, 0, 0] as const;
  const samples: SkySample[] = Array.from({ length: 10 }, (_, hour) => ({
    t: hour * HOUR_MS,
    sun: up,
    earth: hour < 4 ? up : down,
  }));
  const range = { start: 0, end: 10 * HOUR_MS };

  it('need the Sun AND the Earth for a lander without a relay', () => {
    const sky = siteSky(samples, { lat: 0, lon: 0 }, { ...THRESHOLDS, hasRelay: false }, range);
    // Up from the first hour sampled: its true start is not known.
    expect(sky.windows).toEqual([{ start: 0, end: 4 * HOUR_MS, openStart: true }]);
  });

  it('need only the Sun for a lander with a relay', () => {
    const sky = siteSky(samples, { lat: 0, lon: 0 }, { ...THRESHOLDS, hasRelay: true }, range);
    expect(sky.windows).toEqual([{ start: 0, end: 10 * HOUR_MS, openStart: true, openEnd: true }]);
  });

  it('measure the longest window stretch by the same rule as the windows', () => {
    const noRelay = siteSky(samples, { lat: 0, lon: 0 }, { ...THRESHOLDS, hasRelay: false }, range);
    expect(noRelay.longestSunlitDays).toBeCloseTo(10 / 24, 10);
    expect(noRelay.longestWindowDays).toBeCloseTo(4 / 24, 10);
    const relay = siteSky(samples, { lat: 0, lon: 0 }, { ...THRESHOLDS, hasRelay: true }, range);
    expect(relay.longestWindowDays).toBeCloseTo(10 / 24, 10);
  });

  it('give no window stretch when the Earth is up only while the Sun is down', () => {
    // 6 sunlit hours with the Earth down, then 6 dark hours with the Earth up.
    const apart: SkySample[] = Array.from({ length: 12 }, (_, hour) => ({
      t: hour * HOUR_MS,
      sun: hour < 6 ? up : down,
      earth: hour < 6 ? down : up,
    }));
    const span = { start: 0, end: 12 * HOUR_MS };
    const noRelay = siteSky(apart, { lat: 0, lon: 0 }, { ...THRESHOLDS, hasRelay: false }, span);
    expect(noRelay.longestSunlitDays).toBeCloseTo(6 / 24, 10);
    expect(noRelay.earthPct).toBe(50);
    expect(noRelay.longestWindowDays).toBe(0);
    expect(noRelay.windows).toEqual([]);
    const relay = siteSky(apart, { lat: 0, lon: 0 }, { ...THRESHOLDS, hasRelay: true }, span);
    expect(relay.longestWindowDays).toBeCloseTo(6 / 24, 10);
  });

  it('pick the best window by its time inside the range, and return it whole', () => {
    const early = { start: -20 * HOUR_MS, end: 2 * HOUR_MS }; // 22 h long, 2 h inside
    const late = { start: 4 * HOUR_MS, end: 9 * HOUR_MS }; // 5 h long, all inside
    expect(bestWindow([early, late], range)).toBe(late);
    expect(bestWindow([{ start: 20 * HOUR_MS, end: 30 * HOUR_MS }], range)).toBeNull();
    expect(bestWindow([], range)).toBeNull();
  });
});

describe('siteSky', () => {
  const samples = hourlySky(sampledSpan(NOV_15));

  it('gives windows in order, when both the Sun and Earth are up, not cut at the range edges', () => {
    const { windows } = siteSky(samples, { lat: 12.4, lon: -31.8 }, THRESHOLDS, NOV_15);
    expect(windows.length).toBeGreaterThan(0);
    // A window open at the range's end keeps its true close, after the range.
    expect(windows.some((window) => window.start < NOV_15.end && window.end > NOV_15.end)).toBe(
      true,
    );
    for (const [index, window] of windows.entries()) {
      expect(window.end).toBeGreaterThan(window.start);
      expect(window.end - window.start).toBeLessThan(16 * DAY_MS);
      const previous = windows[index - 1];
      if (previous) expect(window.start).toBeGreaterThan(previous.end);
      const middle = new Date((window.start + window.end) / 2);
      expect(sunElevation(12.4, -31.8, middle)).toBeGreaterThanOrEqual(5);
      expect(earthElevation(12.4, -31.8, middle)).toBeGreaterThanOrEqual(5);
    }
  });

  it('takes the shares from the range only, not the margin', () => {
    const near = siteSky(samples, { lat: 12.4, lon: -31.8 }, THRESHOLDS, NOV_15);
    const inRange = samples.filter((sample) => sample.t >= NOV_15.start && sample.t < NOV_15.end);
    expect(inRange).toHaveLength(708);
    expect(near.earthPct).toBe(100);
    expect(near.sunPct).toBeGreaterThan(40);
    expect(near.sunPct).toBeLessThan(55);
  });

  it('has no windows on the far side, where the Earth never rises', () => {
    const farSide = siteSky(samples, { lat: 54.2, lon: 160.3 }, THRESHOLDS, NOV_15);
    expect(farSide.earthPct).toBe(0);
    expect(farSide.windows).toEqual([]);
  });

  it('sees the Earth drop below the south-polar horizon in early-to-mid November 2026', () => {
    // Libration in latitude: the Earth sinks below the horizon near the south pole for part of
    // each month (real geometry; the site is demo).
    expect(
      earthElevation(SOUTH_POLE_SITE.lat, SOUTH_POLE_SITE.lon, new Date('2026-11-09T12:00:00Z')),
    ).toBeLessThan(0);
    expect(
      earthElevation(SOUTH_POLE_SITE.lat, SOUTH_POLE_SITE.lon, new Date('2026-11-22T12:00:00Z')),
    ).toBeGreaterThan(5);
    const polar = siteSky(
      samples,
      SOUTH_POLE_SITE,
      { minSunElevationDeg: 1, minEarthElevationDeg: 1 },
      NOV_15,
    );
    expect(polar.earthPct).toBeGreaterThan(20);
    expect(polar.earthPct).toBeLessThan(80);
  });
});

describe('bestWindow edges', () => {
  const range = { start: 0, end: 10 * HOUR_MS };

  it('picks the earliest of two windows with equal time inside the range', () => {
    const first = { start: 0, end: 3 * HOUR_MS };
    const second = { start: 5 * HOUR_MS, end: 8 * HOUR_MS };
    expect(bestWindow([first, second], range)).toBe(first);
  });

  it('ignores a window that only touches the range edge', () => {
    expect(bestWindow([{ start: -5 * HOUR_MS, end: 0 }], range)).toBeNull();
    expect(bestWindow([{ start: 10 * HOUR_MS, end: 15 * HOUR_MS }], range)).toBeNull();
  });
});

describe('longestDarkHours (the Power check night)', () => {
  it('finds the longest run of hours with the Sun below the horizon, inside the range', () => {
    const samples = hourlySky(sampledSpan(NOV_15));
    const { hours } = longestDarkHours(samples, { lat: 0, lon: 0 }, NOV_15);
    // At the equator a lunar night lasts about half of 29.5 days.
    expect(hours).toBeGreaterThan(300);
    expect(hours).toBeLessThan(372);
    // The same count by hand.
    let longest = 0;
    let run = 0;
    for (const sample of samples.filter((s) => s.t >= NOV_15.start && s.t < NOV_15.end)) {
      run = sunElevation(0, 0, new Date(sample.t)) < 0 ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
    expect(hours).toBe(longest);
  });

  it('says "at least" when the night reaches the edge of the range', () => {
    // Six hours at a site near the north pole: the Sun straight overhead or straight below.
    const site = { lat: 89.9, lon: 0 };
    const range = { start: 0, end: 6 * HOUR_MS };
    const hours = (dark: readonly boolean[]): SkySample[] =>
      dark.map((isDark, i) => ({
        t: i * HOUR_MS,
        sun: isDark ? [0, 0, -1e9] : [0, 0, 1e9],
        earth: [0, 0, 1e9],
      }));
    // Dark for the first two hours: the night began before the range.
    expect(longestDarkHours(hours([true, true, false, false, false, false]), site, range)).toEqual({
      hours: 2,
      atLeast: true,
    });
    // Dark for three hours in the middle: the whole night is inside.
    expect(longestDarkHours(hours([false, true, true, true, false, false]), site, range)).toEqual({
      hours: 3,
      atLeast: false,
    });
    // A short night inside and a longer one running past the end: the longer one, "at least".
    expect(longestDarkHours(hours([false, true, false, true, true, true]), site, range)).toEqual({
      hours: 3,
      atLeast: true,
    });
    expect(
      longestDarkHours(hours([false, false, false, false, false, false]), site, range),
    ).toEqual({ hours: 0, atLeast: false });
  });
});

describe('siteSky with a terrain horizon', () => {
  const samples = hourlySky(sampledSpan(NOV_15));
  const low = { minSunElevationDeg: 1, minEarthElevationDeg: 1 };
  const horizon = (deg: (azimuth: number) => number): HorizonProfile => ({
    elevations: Float32Array.from({ length: 360 }, (_, azimuth) => deg(azimuth)),
    radiusM: 1000,
    spacingM: 80,
    source: 'test',
  });
  const smooth = siteSky(samples, SOUTH_POLE_SITE, low, NOV_15);

  it('changes nothing when the terrain is below every body', () => {
    const flat = siteSky(
      samples,
      SOUTH_POLE_SITE,
      low,
      NOV_15,
      horizon(() => -90),
    );
    expect(flat).toEqual(smooth);
  });

  it('counts nothing as up behind a wall all round', () => {
    const walled = siteSky(
      samples,
      SOUTH_POLE_SITE,
      low,
      NOV_15,
      horizon(() => 90),
    );
    expect(walled.sunPct).toBe(0);
    expect(walled.earthPct).toBe(0);
    expect(walled.windows).toEqual([]);
  });

  it('counts a body only when it is above both the minimum and the terrain in its direction', () => {
    // High ground to the east (azimuth 0–179), none to the west.
    const ground = horizon((azimuth) => (azimuth < 180 ? 3 : -90));
    const result = siteSky(samples, SOUTH_POLE_SITE, low, NOV_15, ground);
    const inRange = samples.filter((s) => s.t >= NOV_15.start && s.t < NOV_15.end);
    const sunUp = inRange.filter((s) => {
      const { azimuth, elevation } = azimuthElevationOf(s.sun, SOUTH_POLE_SITE);
      return elevation >= low.minSunElevationDeg && elevation >= horizonAt(ground, azimuth);
    }).length;
    expect(result.sunPct).toBeCloseTo((sunUp / inRange.length) * 100, 6);
    expect(result.sunPct).toBeLessThanOrEqual(smooth.sunPct);
  });
});

describe('siteSky: hours of Sun, Earth and both (docs/LANDER_RULES.md, "Date range and hours")', () => {
  it('counts one hour per hourly sample: over 29.5 days, hours = share × 708', () => {
    const sky = siteSky(hourlySky(sampledSpan(NOV_15)), SOUTH_POLE_SITE, THRESHOLDS, NOV_15);
    expect(sky.sunHours).toBeCloseTo((sky.sunPct / 100) * 708, 9);
    expect(sky.earthHours).toBeCloseTo((sky.earthPct / 100) * 708, 9);
    expect(Number.isInteger(sky.bothHours)).toBe(true);
    expect(sky.bothHours).toBeLessThanOrEqual(Math.min(sky.sunHours, sky.earthHours));
    expect(sky.bothHours).toBeGreaterThanOrEqual(sky.sunHours + sky.earthHours - 708);
  });

  it('counts the hours of a picked range only, not the margin around it', () => {
    const range = { start: Date.UTC(2026, 11, 12), end: Date.UTC(2026, 11, 26) };
    const sky = siteSky(
      hourlySky(sampledSpan(range)),
      { lat: 12.4, lon: -31.8 },
      { minSunElevationDeg: -90, minEarthElevationDeg: -90 },
      range,
    );
    // Everything counts as up at −90°: every hour of the 14 days.
    expect([sky.sunHours, sky.earthHours, sky.bothHours]).toEqual([336, 336, 336]);
  });
});
