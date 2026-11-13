/**
 * The Timeline's bracket (docs/LANDER_RULES.md, "Timeline"): the selected range drawn over the 12
 * months, dragged by whole days and kept inside them. Dates are 00:00 UTC on their day; the stop
 * date is included (the range runs to 00:00 after it), as in the Mission view. Pure.
 */
import {
  DAY_MS,
  TIME_MAX_MS,
  TIME_MIN_MS,
  addMonthsUtc,
  formatDayMonth,
  type TimeRange,
} from '../../utils/time';
import { utcDayStart } from './yearWindows';

/** Picked dates: 00:00 UTC on the start and on the (included) stop date. */
export interface BracketDates {
  readonly startMs: number;
  readonly stopMs: number;
}

/**
 * The selected range as whole days: from its start day, as many days as it is long (the time bar's
 * 29.5 days rounds to 30).
 */
export function bracketDates(range: TimeRange): BracketDates {
  const startMs = utcDayStart(range.start);
  const days = Math.max(1, Math.round((range.end - range.start) / DAY_MS));
  return { startMs, stopMs: startMs + (days - 1) * DAY_MS };
}

/**
 * The dates moved by whole days, start and stop together, kept inside [from, to) and inside the
 * app's dates (1 Jan 1990 to 31 Dec 2100): the start never before `from`, the day after the stop
 * never after `to`.
 */
export function moveBracket(
  dates: BracketDates,
  byDays: number,
  span: { from: number; to: number },
): BracketDates {
  const length = dates.stopMs - dates.startMs;
  const from = Math.max(span.from, TIME_MIN_MS);
  const to = Math.min(span.to, utcDayStart(TIME_MAX_MS) + DAY_MS);
  const latest = to - DAY_MS - length;
  const wanted = dates.startMs + Math.round(byDays) * DAY_MS;
  const startMs = Math.max(from, Math.min(latest, wanted));
  return { startMs, stopMs: startMs + length };
}

/** Whole days between two dates' starts (how far the bracket has moved). */
export function daysBetween(a: number, b: number): number {
  return Math.round((b - a) / DAY_MS);
}

/** Where a range sits on the Timeline, as fractions 0–1 of [from, to). */
export function bracketPlace(
  range: TimeRange,
  span: { from: number; to: number },
): { left: number; width: number } {
  const total = span.to - span.from;
  const left = Math.max(0, (range.start - span.from) / total);
  const right = Math.min(1, (range.end - span.from) / total);
  return { left, width: Math.max(0, right - left) };
}

/**
 * The Timeline's month ticks: the 1st of each month inside [from, to), each at its place (0–1),
 * labelled with the month, and the year on January and on the first tick.
 */
export function monthTicks(span: {
  from: number;
  to: number;
}): { at: number; left: number; label: string }[] {
  const date = new Date(span.from);
  const firstOfMonth = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  const first = firstOfMonth >= span.from ? firstOfMonth : addMonthsUtc(firstOfMonth, 1);
  const ticks: { at: number; left: number; label: string }[] = [];
  for (let at = first; at < span.to; at = addMonthsUtc(at, 1)) {
    const when = new Date(at);
    const month = formatDayMonth(at).split(' ')[1] ?? '';
    const year = ticks.length === 0 || when.getUTCMonth() === 0 ? ` ${when.getUTCFullYear()}` : '';
    ticks.push({ at, left: (at - span.from) / (span.to - span.from), label: `${month}${year}` });
  }
  return ticks;
}
