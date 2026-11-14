/**
 * The time bar's range follows the playhead: when the time (playing, stepping, or a picked date)
 * leaves the range shown, the range moves, with the same width, to the dates around it, staying
 * inside the data coverage (docs/LANDER_RULES.md, "Date range and hours"). Pure.
 */
import { useMemo } from 'react';
import type { DemoMission } from '../../data/demoData';
import { siteSamples, type HorizonsSeries } from '../../services/horizonsData';
import type { LatLon } from '../../utils/lunarSky';
import { sampledSpan, siteSky } from '../../utils/skyVisibility';
import type { HorizonProfile } from '../../utils/terrainShadow';
import { DAY_MS, formatDayMonth, type TimeRange, type TimeWindowMs } from '../../utils/time';

export interface FollowedRange {
  /** The range to show: `shown` itself when nothing moves. */
  readonly range: TimeRange;
  /** "No data after 31 Dec 2027" when the time is outside the data, else null. */
  readonly note: string | null;
}

/** "31 Dec 2027". */
const dateText = (ms: number) => `${formatDayMonth(ms)} ${new Date(ms).getUTCFullYear()}`;

/**
 * The range to show for a time: `shown` while the time is inside it; otherwise a range of the same
 * width starting on the whole UTC day half a width before the time, moved back inside `coverage`
 * if it would run past an edge. Outside the coverage the range stays at the edge and says so.
 */
export function followRange(
  shown: TimeRange,
  time: number,
  coverage: TimeRange | null,
): FollowedRange {
  const width = shown.end - shown.start;
  let range = shown;
  if (time < shown.start || time > shown.end) {
    const start = Math.floor((time - width / 2) / DAY_MS) * DAY_MS;
    range = { start, end: start + width };
    if (coverage) {
      if (range.end > coverage.end) {
        range = { start: Math.max(coverage.start, coverage.end - width), end: coverage.end };
      }
      if (range.start < coverage.start) {
        range = { start: coverage.start, end: Math.min(coverage.end, coverage.start + width) };
      }
    }
    if (range.start === shown.start && range.end === shown.end) range = shown;
  }
  let note: string | null = null;
  if (coverage && time > coverage.end) note = `No data after ${dateText(coverage.end)}`;
  else if (coverage && time < coverage.start) note = `No data before ${dateText(coverage.start)}`;
  return { range, note };
}

/**
 * The good windows (the checks' own rule) over a moved range, for the bar's shading: the same
 * samples and the same test as the Results, over the new dates. Null while there is nothing to
 * work out.
 */
export function useRangeWindows(
  place: LatLon | null,
  mission: DemoMission,
  range: TimeRange | null,
  series: HorizonsSeries | null,
  terrain: HorizonProfile | null,
): readonly TimeWindowMs[] | null {
  const lat = place?.lat ?? null;
  const lon = place?.lon ?? null;
  const start = range?.start ?? null;
  const end = range?.end ?? null;
  return useMemo(() => {
    if (lat === null || lon === null || start === null || end === null) return null;
    const shown = { start, end };
    const { samples } = siteSamples(series, { lat, lon }, sampledSpan(shown));
    return siteSky(samples, { lat, lon }, mission, shown, terrain).windows;
  }, [lat, lon, start, end, mission, series, terrain]);
}
