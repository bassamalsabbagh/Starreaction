/**
 * When the Sun and Earth are up at a site over a time range: hourly samples of the real geometry
 * (src/utils/lunarSky.ts) turned into shares of the range and into landing windows. Pure, no
 * React; the app computes it when the range, the lander or the site list changes, never per tick.
 *
 * Each hourly sample stands for the hour that starts there, so windows have hour resolution.
 * Windows are found over a wider span than the range (WINDOW_MARGIN_MS each side), so a window
 * that runs past the range's edge keeps its true start and end; the shares use the range only.
 */
import {
  EARTH_RADIUS_KM,
  SUN_RADIUS_KM,
  aboveHorizonTest,
  azimuthElevationOf,
  lunarSky,
  upperLimbTest,
  type LatLon,
  type LunarSky,
} from './lunarSky';
import { horizonAt, type HorizonProfile } from './terrainShadow';
import { DAY_MS, HOUR_MS, type TimeRange, type TimeWindowMs } from './time';

/** A window lasts at most about half a synodic month, so 15 days either side finds its ends. */
export const WINDOW_MARGIN_MS = 15 * DAY_MS;

export interface SkySample extends LunarSky {
  /** Start of the hour, UTC ms. */
  t: number;
}

/** The minimum elevations that count as "up" (degrees above a smooth horizon), and whether the
 * lander talks to Earth through a relay (then a window only needs the Sun). */
export interface SkyThresholds {
  minSunElevationDeg: number;
  minEarthElevationDeg: number;
  hasRelay?: boolean;
}

export interface SiteSky {
  /** Share of the range with the Sun at or above the minimum, 0–100. */
  sunPct: number;
  /** Share of the range with the Earth at or above the minimum, 0–100. */
  earthPct: number;
  /** Hours in the range with the Sun up: one per hourly sample ("Date range and hours"). */
  sunHours: number;
  /** Hours in the range with the Earth up. */
  earthHours: number;
  /** Hours in the range with the Sun and the Earth both up at once. */
  bothHours: number;
  /** The longest continuous run of hours with the Sun up inside the range, in days. */
  longestSunlitDays: number;
  /** The longest continuous run of window hours (the rule below) inside the range, in days. */
  longestWindowDays: number;
  /** The Sun up and (without a relay) the Earth up, merged into continuous intervals, in order. */
  windows: readonly TimeWindowMs[];
}

/** Ephemeris samples by hour number. The geometry never changes, so they are kept and reused as
 * the range slides; the cache is cleared if it grows past a few years of hours. */
const cache = new Map<number, LunarSky>();
const CACHE_LIMIT = 30_000;

/** The Sun and Earth at the start of an hour (hour number since the epoch), from the cache. */
export function skyAtHour(hour: number): LunarSky {
  if (cache.size > CACHE_LIMIT) cache.clear();
  let sky = cache.get(hour);
  if (!sky) {
    sky = lunarSky(new Date(hour * HOUR_MS));
    cache.set(hour, sky);
  }
  return sky;
}

/** One sample per whole hour inside the range (start rounded up to the hour). */
export function hourlySky(range: TimeRange): SkySample[] {
  const samples: SkySample[] = [];
  for (let hour = Math.ceil(range.start / HOUR_MS); hour * HOUR_MS < range.end; hour += 1) {
    const sky = skyAtHour(hour);
    samples.push({ t: hour * HOUR_MS, sun: sky.sun, earth: sky.earth });
  }
  return samples;
}

/**
 * Runs of `true` as intervals, each sample lasting `step`; the last one is cut at `end`. A run
 * that starts at the first sample or lasts to the last one is marked open-ended there: it may
 * have begun earlier, or go on later, than the samples show.
 */
export function mergeRuns(
  times: readonly number[],
  flags: readonly boolean[],
  end: number,
  step = HOUR_MS,
): TimeWindowMs[] {
  const runs: TimeWindowMs[] = [];
  let start: number | null = null;
  const first = times[0];
  const run = (from: number, to: number, openEnd: boolean): TimeWindowMs => ({
    start: from,
    end: to,
    ...(from === first ? { openStart: true } : {}),
    ...(openEnd ? { openEnd: true } : {}),
  });
  times.forEach((t, index) => {
    if (flags[index]) {
      if (start === null) start = t;
    } else if (start !== null) {
      runs.push(run(start, t, false));
      start = null;
    }
  });
  const last = times[times.length - 1];
  if (start !== null && last !== undefined) runs.push(run(start, Math.min(end, last + step), true));
  return runs;
}

/** The longest run of consecutive `true` values (0 when there is none). */
export function longestRun(flags: readonly boolean[]): number {
  let longest = 0;
  let run = 0;
  for (const flag of flags) {
    run = flag ? run + 1 : 0;
    if (run > longest) longest = run;
  }
  return longest;
}

/**
 * The best window: the one with the most time inside the range (the earliest on a tie), or null.
 * Judged inside the range, like the daylight gate, so a window that mostly fell before the range
 * does not win; it is returned whole, with its true start and end.
 */
export function bestWindow(
  windows: readonly TimeWindowMs[],
  range: TimeRange,
): TimeWindowMs | null {
  let best: TimeWindowMs | null = null;
  let bestInside = 0;
  for (const window of windows) {
    const inside = Math.min(window.end, range.end) - Math.max(window.start, range.start);
    if (inside > bestInside) {
      best = window;
      bestInside = inside;
    }
  }
  return best;
}

/**
 * The longest night inside the range: the longest unbroken run of hours with the Sun's upper limb
 * below the smooth horizon (0°; docs/LANDER_RULES.md, "Is it up: the upper limb"). `atLeast` when
 * that run touches the first or last hour of the range, so the night may run on past it
 * (docs/LANDER_RULES.md, "Power check").
 */
export function longestDarkHours(
  samples: readonly SkySample[],
  site: LatLon,
  range: TimeRange,
): { hours: number; atLeast: boolean } {
  const limbUp = upperLimbTest(site);
  const inRange = samples.filter((sample) => sample.t >= range.start && sample.t < range.end);
  let longest = 0;
  let longestTouchesEdge = false;
  let run = 0;
  let runFromStart = false;
  inRange.forEach((sample, index) => {
    if (limbUp(sample.sun, SUN_RADIUS_KM)) {
      run = 0;
      return;
    }
    if (run === 0) runFromStart = index === 0;
    run += 1;
    const touches = runFromStart || index === inRange.length - 1;
    if (run > longest || (run === longest && touches)) {
      longest = run;
      longestTouchesEdge = touches;
    }
  });
  // One sample per hour, so the run's length is its hours.
  return { hours: longest, atLeast: longest > 0 && longestTouchesEdge };
}

/** The span to sample for a range: the range plus the window margin on each side. */
export function sampledSpan(range: TimeRange): TimeRange {
  return { start: range.start - WINDOW_MARGIN_MS, end: range.end + WINDOW_MARGIN_MS };
}

/**
 * The checks' "up" test for a body (radius `radiusKm`) seen from a site: its upper limb above the
 * horizon, the smooth 0° one or, with a terrain horizon, the terrain in its direction
 * (docs/LANDER_RULES.md, "Is it up: the upper limb" and "Terrain horizon"); and its centre at or
 * above the mission's minimum height, which stays on the centre. Every check, share, hour and the
 * Timeline use this one test.
 */
export function upTest(
  site: LatLon,
  terrain: HorizonProfile | null = null,
): (target: LunarSky['sun'], minElevationDeg: number, radiusKm: number) => boolean {
  const centreAtLeast = aboveHorizonTest(site);
  const limbUp = upperLimbTest(site);
  return (target, minElevationDeg, radiusKm) => {
    if (!centreAtLeast(target, minElevationDeg)) return false;
    if (!terrain) return limbUp(target, radiusKm);
    const { azimuth } = azimuthElevationOf(target, site);
    return limbUp(target, radiusKm, horizonAt(terrain, azimuth));
  };
}

/**
 * Sun and Earth shares and hours and the longest sunlit and window stretches (over `range` only), and windows
 * (over all the samples, so they are not cut at the range's edges) for one site. With a terrain
 * horizon, a body is up only when it is above both the minimum and the terrain in its direction
 * (docs/LANDER_RULES.md, "Terrain horizon").
 */
export function siteSky(
  samples: readonly SkySample[],
  site: LatLon,
  thresholds: SkyThresholds,
  range: TimeRange,
  terrain: HorizonProfile | null = null,
): SiteSky {
  const above = upTest(site, terrain);
  let inRange = 0;
  let sunUp = 0;
  let earthUp = 0;
  let bothUp = 0;
  const sunInRange: boolean[] = [];
  const windowInRange: boolean[] = [];
  const windowHours = samples.map((sample) => {
    const sun = above(sample.sun, thresholds.minSunElevationDeg, SUN_RADIUS_KM);
    const earth = above(sample.earth, thresholds.minEarthElevationDeg, EARTH_RADIUS_KM);
    const window = sun && (thresholds.hasRelay === true || earth);
    if (sample.t >= range.start && sample.t < range.end) {
      inRange += 1;
      if (sun) sunUp += 1;
      if (earth) earthUp += 1;
      if (sun && earth) bothUp += 1;
      sunInRange.push(sun);
      windowInRange.push(window);
    }
    return window;
  });
  const last = samples[samples.length - 1];
  return {
    sunPct: inRange ? (sunUp / inRange) * 100 : 0,
    earthPct: inRange ? (earthUp / inRange) * 100 : 0,
    sunHours: sunUp,
    earthHours: earthUp,
    bothHours: bothUp,
    longestSunlitDays: (longestRun(sunInRange) * HOUR_MS) / DAY_MS,
    longestWindowDays: (longestRun(windowInRange) * HOUR_MS) / DAY_MS,
    windows: mergeRuns(
      samples.map((sample) => sample.t),
      windowHours,
      last ? last.t + HOUR_MS : 0,
    ),
  };
}
