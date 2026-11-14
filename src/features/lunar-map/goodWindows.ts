/**
 * "Other recommended dates": the windows ahead in which the mission's checks all pass, from the
 * same samples and the same rule as the Results (docs/LANDER_RULES.md, "The checks"). A window is
 * a stretch with the Sun up and, without a relay, the Earth up too; it is good when it lasts the
 * days the mission needs. Pure.
 */
import { useMemo } from 'react';
import type { DemoMission } from '../../data/demoData';
import { siteSamples, type HorizonsSeries } from '../../services/horizonsData';
import type { LatLon } from '../../utils/lunarSky';
import { siteSky } from '../../utils/skyVisibility';
import type { HorizonProfile } from '../../utils/terrainShadow';
import { DAY_MS, RANGE_MS, type TimeWindowMs } from '../../utils/time';

/** How far ahead to look: six of the time bar's 29.5-day months. */
export const GOOD_WINDOW_MONTHS = 6;

export interface GoodWindow {
  readonly start: number;
  readonly end: number;
  /** Its length in days. */
  readonly days: number;
}

/** The dates (00:00 UTC each, the stop date included) that cover a window. */
export function windowDates(window: Pick<TimeWindowMs, 'start' | 'end'>): {
  startMs: number;
  stopMs: number;
} {
  const startMs = Math.floor(window.start / DAY_MS) * DAY_MS;
  // A window ending exactly at midnight does not need that day.
  const stopMs = Math.ceil(window.end / DAY_MS) * DAY_MS - DAY_MS;
  return { startMs, stopMs: Math.max(startMs, stopMs) };
}

/**
 * The good windows ahead from `from` (six of the time bar's months), in order: each window lasting at least
 * the mission's days, cut at `from`. A window that starts on the same day as `skipDay` (the dates
 * already shown) is left out.
 */
export function goodWindows(
  place: LatLon,
  mission: DemoMission,
  from: number,
  series: HorizonsSeries | null = null,
  terrain: HorizonProfile | null = null,
  skipDay: number | null = null,
): GoodWindow[] {
  const span = { start: from, end: from + GOOD_WINDOW_MONTHS * RANGE_MS };
  const { samples } = siteSamples(series, place, span);
  const sky = siteSky(samples, place, mission, span, terrain);
  return sky.windows
    .map((window) => ({ start: Math.max(window.start, from), end: window.end }))
    .map((window) => ({ ...window, days: (window.end - window.start) / DAY_MS }))
    .filter((window) => window.days >= mission.daysNeeded)
    .filter(
      (window) =>
        skipDay === null || Math.floor(window.start / DAY_MS) !== Math.floor(skipDay / DAY_MS),
    );
}

/** The good windows for the Results card and the details panel, worked out once per change. */
export function useGoodWindows(
  place: LatLon | null,
  mission: DemoMission,
  from: number,
  series: HorizonsSeries | null,
  terrain: HorizonProfile | null,
  skipDay: number | null,
  active: boolean,
): GoodWindow[] | null {
  const lat = place?.lat ?? null;
  const lon = place?.lon ?? null;
  return useMemo(
    () =>
      active && lat !== null && lon !== null
        ? goodWindows({ lat, lon }, mission, from, series, terrain, skipDay)
        : null,
    [active, lat, lon, mission, from, series, terrain, skipDay],
  );
}
