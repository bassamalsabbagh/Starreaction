/**
 * The Timeline's bars (docs/LANDER_RULES.md, "Timeline"): for each step (6 hours by default) from
 * 00:00 UTC on the start date over 12 months, whether the Sun and the Earth are up at the step's
 * start, tested exactly as the checks test them (`upTest`: the mission's minimum heights, and the
 * terrain horizon where the site has one), from the same positions (JPL Horizons inside the files,
 * our engine outside them). No new check or measure. Pure.
 */
import { horizonsSky, type HorizonsSeries } from '../../services/horizonsData';
import { EARTH_RADIUS_KM, SUN_RADIUS_KM, type LatLon } from '../../utils/lunarSky';
import { skyAtHour, upTest, type SkyThresholds } from '../../utils/skyVisibility';
import type { HorizonProfile } from '../../utils/terrainShadow';
import { DAY_MS, HOUR_MS, addMonthsUtc, formatDayMonth } from '../../utils/time';

/** What is up: both, the Sun only, the Earth only, or neither. */
export type SkyState = 'both' | 'sun' | 'earth' | 'none';

export const SKY_STATE_TEXT: Readonly<Record<SkyState, string>> = {
  both: 'Sun and Earth both up',
  sun: 'Sun only',
  earth: 'Earth only',
  none: 'Neither up',
};

/** A run of steps in one state, [start, end) UTC ms. */
export interface SkyRun {
  readonly start: number;
  readonly end: number;
  readonly state: SkyState;
}

/** One site for the Timeline: where, the mission's minimum heights, its terrain and positions. */
export interface YearSite extends LatLon {
  readonly thresholds: Pick<SkyThresholds, 'minSunElevationDeg' | 'minEarthElevationDeg'>;
  readonly terrain?: HorizonProfile | null;
  /** The site's JPL Horizons series (only valid for this site), or null: our engine. */
  readonly series?: HorizonsSeries | null;
}

export interface YearWindows {
  /** 00:00 UTC on the start date, and the end of the months shown. */
  readonly start: number;
  readonly end: number;
  readonly runs: readonly SkyRun[];
  /** How many steps there were, and how many took their positions from JPL Horizons. */
  readonly steps: number;
  readonly horizonsSteps: number;
  /** The first and last step that took its positions from JPL Horizons, or null for none. */
  readonly horizonsFirst: number | null;
  readonly horizonsLast: number | null;
  /** The last step's time. */
  readonly lastStep: number;
}

/** 00:00 UTC on the day of `ms`. */
export function utcDayStart(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

/**
 * The site's states over `months` from 00:00 UTC on `start`'s day, one test per `stepHours`, merged
 * into runs; each step stands for its whole step (the last one stops at the end).
 */
export function yearWindows(
  site: YearSite,
  start: number,
  months = 12,
  stepHours = 6,
): YearWindows {
  const from = utcDayStart(start);
  const end = addMonthsUtc(from, months);
  const step = stepHours * HOUR_MS;
  const up = upTest(site, site.terrain ?? null);
  const runs: SkyRun[] = [];
  let steps = 0;
  let horizonsSteps = 0;
  let horizonsFirst: number | null = null;
  let horizonsLast: number | null = null;
  let lastStep = from;
  for (let t = from; t < end; t += step) {
    const fromSeries = site.series ? horizonsSky(site.series, site, t) : null;
    if (fromSeries) {
      horizonsSteps += 1;
      horizonsFirst ??= t;
      horizonsLast = t;
    }
    const sky = fromSeries ?? skyAtHour(Math.floor(t / HOUR_MS));
    const sun = up(sky.sun, site.thresholds.minSunElevationDeg, SUN_RADIUS_KM);
    const earth = up(sky.earth, site.thresholds.minEarthElevationDeg, EARTH_RADIUS_KM);
    const state: SkyState = sun && earth ? 'both' : sun ? 'sun' : earth ? 'earth' : 'none';
    const stop = Math.min(t + step, end);
    const last = runs[runs.length - 1];
    if (last && last.state === state && last.end === t) {
      runs[runs.length - 1] = { ...last, end: stop };
    } else {
      runs.push({ start: t, end: stop, state });
    }
    steps += 1;
    lastStep = t;
  }
  return {
    start: from,
    end,
    runs,
    steps,
    horizonsSteps,
    horizonsFirst,
    horizonsLast,
    lastStep,
  };
}

/** The state at a moment, from the runs (null outside them). */
export function stateAt(windows: YearWindows, t: number): SkyState | null {
  return windows.runs.find((run) => t >= run.start && t < run.end)?.state ?? null;
}

/** "1 Nov 2026". */
const dateText = (ms: number) => `${formatDayMonth(ms)} ${new Date(ms).getUTCFullYear()}`;

/**
 * Which positions the bars came from: "Positions: JPL Horizons", our engine, or JPL Horizons with
 * the engine's part named ("(our engine before 1 Nov 2026)").
 */
export function positionsNote(windows: YearWindows): string {
  const { horizonsFirst, horizonsLast } = windows;
  if (windows.horizonsSteps === windows.steps) return 'Positions: JPL Horizons';
  if (horizonsFirst === null || horizonsLast === null) {
    return 'Positions: our engine (checked against JPL Horizons)';
  }
  const parts = [
    horizonsFirst > windows.start ? `before ${dateText(horizonsFirst)}` : null,
    horizonsLast < windows.lastStep ? `after ${dateText(horizonsLast)}` : null,
  ].filter((part) => part !== null);
  return `Positions: JPL Horizons (our engine ${parts.join(' and ')})`;
}
