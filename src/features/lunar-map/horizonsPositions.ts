/**
 * The fixed sites' JPL Horizons samples as the app uses them (docs/LANDER_RULES.md, "Sun and Earth
 * positions: JPL Horizons"): as a position source for "now" and the next set or rise, and the label
 * that says where a range's positions came from. Pure.
 */
import {
  HORIZONS_LABEL,
  horizonsAzEl,
  seriesSpan,
  type HorizonsSeries,
} from '../../services/horizonsData';
import type { PositionSamples } from '../../utils/riseSet';
import { HOUR_MS, formatDayMonth, type TimeRange } from '../../utils/time';

/** Points, and dates outside the Horizons files. */
export const ENGINE_LABEL = 'Sun and Earth positions: our engine (checked against JPL Horizons)';

/** A site's Horizons series as a position source for `bodyNow`, or null without one. */
export function positionsOf(series: HorizonsSeries | null): PositionSamples | null {
  if (!series) return null;
  return {
    startMs: series.startMs,
    stepMs: series.stepMs,
    azEl: (body, t) => horizonsAzEl(series, body, t),
  };
}

/** "1 Nov 2026" (UTC). */
function dateText(ms: number): string {
  return `${formatDayMonth(ms)} ${new Date(ms).getUTCFullYear()}`;
}

/**
 * Where the positions behind a range's checks came from, counted over the same whole hours the
 * checks use: all from Horizons, all from the engine, or how many hours from each (and which end
 * of the range the engine covered).
 */
export function positionsLabel(series: HorizonsSeries | null, range: TimeRange): string {
  if (!series) return ENGINE_LABEL;
  const span = seriesSpan(series);
  let total = 0;
  let covered = 0;
  let before = false;
  let after = false;
  for (let hour = Math.ceil(range.start / HOUR_MS); hour * HOUR_MS < range.end; hour += 1) {
    const t = hour * HOUR_MS;
    total += 1;
    if (t < span.start) before = true;
    else if (t > span.end) after = true;
    else covered += 1;
  }
  if (total > 0 && covered === total) return HORIZONS_LABEL;
  if (covered === 0) return ENGINE_LABEL;
  const rest = [
    before ? `before ${dateText(span.start)}` : null,
    after ? `after ${dateText(span.end)}` : null,
  ].filter((part) => part !== null);
  return `Sun and Earth positions: JPL Horizons for ${covered.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} hours; our engine (checked against JPL Horizons) for the hours ${rest.join(' and ')}`;
}
