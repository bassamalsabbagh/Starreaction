/**
 * The dates the checks run over (docs/LANDER_RULES.md, "Date range and hours"): from 00:00 UTC on
 * the start date to 00:00 UTC after the stop date (the stop date is included), at most 12 months,
 * inside 1990–2100. Without picked dates the app uses the time bar's 29.5 days. Pure.
 */
import {
  DAY_MS,
  addMonthsUtc,
  TIME_MAX_MS,
  TIME_MIN_MS,
  formatDayMonth,
  parseUtcInput,
  type TimeRange,
} from '../../utils/time';

export { addMonthsUtc };

/** The picked dates, each 00:00 UTC on its day. */
export interface DateRange {
  readonly startMs: number;
  readonly stopMs: number;
}

export const RANGE_MONTHS_MAX = 12;

/** The span the checks use: the start date's 00:00 UTC to the day after the stop date. */
export function toTimeRange(range: DateRange): TimeRange {
  return { start: range.startMs, end: range.stopMs + DAY_MS };
}

/** "2026-12-12" (an <input type="date"> value), UTC. */
export function dateInputValue(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** "12 Dec 2026". */
export function dateText(ms: number): string {
  return `${formatDayMonth(ms)} ${new Date(ms).getUTCFullYear()}`;
}

/** "12 Dec 2026 to 25 Dec 2026 (UTC)". */
export function dateRangeText(range: DateRange): string {
  return `${dateText(range.startMs)} to ${dateText(range.stopMs)} (UTC)`;
}

/** Why two dates cannot be a range, or null when they can. */
export function dateRangeError(range: DateRange): string | null {
  if (range.startMs < TIME_MIN_MS || range.stopMs > TIME_MAX_MS) {
    return 'Choose dates from 1 Jan 1990 to 31 Dec 2100.';
  }
  if (range.stopMs < range.startMs) return 'The stop date is before the start date.';
  if (toTimeRange(range).end > addMonthsUtc(range.startMs, RANGE_MONTHS_MAX)) {
    return `Pick at most ${RANGE_MONTHS_MAX} months.`;
  }
  return null;
}

/**
 * The two date fields as a range: null while either is empty, an error for an impossible date,
 * one outside 1990–2100, a stop date before the start, or more than 12 months.
 */
export function readDateRange(
  start: string,
  stop: string,
): { range: DateRange } | { error: string } | null {
  if (start.trim() === '' || stop.trim() === '') return null;
  const from = parseUtcInput(start, '00:00');
  if (!from.ok) return { error: `Start date: ${from.error}` };
  const to = parseUtcInput(stop, '00:00');
  if (!to.ok) return { error: `Stop date: ${to.error}` };
  const range = { startMs: from.ms, stopMs: to.ms };
  const error = dateRangeError(range);
  return error ? { error } : { range };
}

/**
 * "Delay 1 week" or "Delay 1 month": both dates 7 days later, or one calendar month later (a day
 * the month lacks becomes its last day).
 */
export function delayRange(range: DateRange, by: 'week' | 'month'): DateRange {
  if (by === 'week')
    return { startMs: range.startMs + 7 * DAY_MS, stopMs: range.stopMs + 7 * DAY_MS };
  return { startMs: addMonthsUtc(range.startMs, 1), stopMs: addMonthsUtc(range.stopMs, 1) };
}
