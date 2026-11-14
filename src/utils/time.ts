/**
 * Time helpers for the app clock. All times are UTC milliseconds; nothing here reads the real
 * clock, so every function is pure and testable.
 */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** The clock can be set from 1990-01-01 00:00 to 2100-12-31 23:59 UTC. */
export const TIME_MIN_MS = Date.UTC(1990, 0, 1);
export const TIME_MAX_MS = Date.UTC(2100, 11, 31, 23, 59);

/** The time bar spans one synodic month (about 29.5 days), centred on its centre time. */
export const RANGE_MS = 29.5 * DAY_MS;

/** Amman is on UTC+3 all year. */
const AMMAN_OFFSET_MS = 3 * HOUR_MS;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (value: number) => String(value).padStart(2, '0');

export function clampTime(ms: number): number {
  return Math.min(TIME_MAX_MS, Math.max(TIME_MIN_MS, ms));
}

export function floorToMinute(ms: number): number {
  return Math.floor(ms / MINUTE_MS) * MINUTE_MS;
}

function parts(ms: number) {
  const date = new Date(ms);
  return {
    day: date.getUTCDate(),
    month: MONTHS[date.getUTCMonth()] ?? '',
    year: date.getUTCFullYear(),
    hhmm: `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`,
  };
}

/** "26 Oct 2026 · 14:05 UTC" (minutes, no seconds). */
export function formatClock(ms: number): string {
  const { day, month, year, hhmm } = parts(ms);
  return `${day} ${month} ${year} · ${hhmm} UTC`;
}

/** The same moment in Amman: "26 Oct 2026 · 17:05 Amman (UTC+3)". */
export function formatAmman(ms: number): string {
  const { day, month, year, hhmm } = parts(ms + AMMAN_OFFSET_MS);
  return `${day} ${month} ${year} · ${hhmm} Amman (UTC+3)`;
}

/** "18 Nov". */
export function formatDayMonth(ms: number): string {
  const { day, month } = parts(ms);
  return `${day} ${month}`;
}

/** "18 Nov 06:00 to 27 Nov 18:00 UTC". */
export function formatRangeUtc(startMs: number, endMs: number): string {
  const start = parts(startMs);
  const end = parts(endMs);
  return `${start.day} ${start.month} ${start.hhmm} to ${end.day} ${end.month} ${end.hhmm} UTC`;
}

/** The values for a date input (YYYY-MM-DD) and a time input (HH:MM). */
export function toInputValues(ms: number): { date: string; time: string } {
  const date = new Date(ms);
  return {
    date: `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`,
    time: `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`,
  };
}

export type ParsedTime =
  { ok: true; ms: number } | { ok: false; error: string; field: 'date' | 'time' };

/**
 * Reads a UTC date (YYYY-MM-DD, as a date input gives it) and time (HH:MM), rejecting impossible
 * dates (31 Feb) and the out-of-range. Date inputs empty themselves on an impossible date, so an
 * empty date reads as incomplete.
 */
export function parseUtcInput(date: string, time: string): ParsedTime {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!dateMatch) return { ok: false, error: 'Enter a complete date.', field: 'date' };
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!timeMatch) return { ok: false, error: 'Enter the time as HH:MM, 24-hour.', field: 'time' };

  const [year, month, day] = [Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3])];
  const [hours, minutes] = [Number(timeMatch[1]), Number(timeMatch[2])];
  if (hours > 23 || minutes > 59) {
    return { ok: false, error: 'Enter the time as HH:MM, 24-hour.', field: 'time' };
  }

  const ms = Date.UTC(year, month - 1, day, hours, minutes);
  const check = new Date(ms);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return { ok: false, error: 'That date does not exist.', field: 'date' };
  }
  if (ms < TIME_MIN_MS || ms > TIME_MAX_MS) {
    return { ok: false, error: 'Choose a date from 1 Jan 1990 to 31 Dec 2100.', field: 'date' };
  }
  return { ok: true, ms };
}

/**
 * Days to one decimal, rounded down, so a near miss never reads as enough ("2.9" under 3). Every
 * day count in the app goes through this, so the same stretch shows the same number everywhere.
 */
export function tenthsOfDayDown(days: number): number {
  return Math.floor(days * 10 + 1e-9) / 10;
}

/** A window's length in days, to one decimal: "13.9 days", or "over 59.5 days" when open-ended. */
export function formatWindowDays(window: TimeWindowMs): string {
  const days = `${tenthsOfDayDown((window.end - window.start) / DAY_MS)} days`;
  return window.openStart || window.openEnd ? `over ${days}` : days;
}

/** Whole calendar months later (or earlier), the day kept or moved to the month's last day. */
export function addMonthsUtc(ms: number, months: number): number {
  const date = new Date(ms);
  const total = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(
    year,
    month,
    Math.min(date.getUTCDate(), lastDay),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  );
}

/** How much of a window falls inside a range, ms (0 when they don't overlap). */
export function insideRangeMs(window: TimeWindowMs, range: TimeRange): number {
  return Math.max(0, Math.min(window.end, range.end) - Math.max(window.start, range.start));
}

/**
 * A window's whole length, plus the part inside the checked range when the window runs past it:
 * "12.9 days (10.2 days in this month)", or "in these dates" for picked dates. The checks and the
 * Sites list use the part inside the range, so whenever the two would read differently both are
 * shown.
 */
export function formatWindowLength(window: TimeWindowMs, range: TimeRange): string {
  const whole = formatWindowDays(window);
  const inside = insideRangeMs(window, range);
  const insideDays = tenthsOfDayDown(inside / DAY_MS);
  return inside < window.end - window.start &&
    insideDays !== tenthsOfDayDown((window.end - window.start) / DAY_MS)
    ? `${whole} (${insideDays} days ${rangeWords(range).within})`
    : whole;
}

/** "18 Nov 06:00 to 27 Nov 18:00 UTC"; an open-ended window says "before …" or "after …". */
export function formatWindowRange(window: TimeWindowMs): string {
  const start = parts(window.start);
  const end = parts(window.end);
  return `${window.openStart ? 'before ' : ''}${start.day} ${start.month} ${start.hhmm} to ${window.openEnd ? 'after ' : ''}${end.day} ${end.month} ${end.hhmm} UTC`;
}

/** "3d 4h", "5h 12m", "12m"; under a minute is "under 1m". */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / MINUTE_MS);
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const rest = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${rest}m`;
  if (rest > 0) return `${rest}m`;
  return 'under 1m';
}

/** The forecasts' countdown, units spaced: "2 d 4 h", "5 h 12 m", "12 m"; "under 1 m". */
export function formatCountdown(ms: number): string {
  return formatDuration(ms).replace(/(\d)([dhm])\b/g, '$1 $2');
}

export interface TimeRange {
  start: number;
  end: number;
}

/** How copy names a range: the time bar's 29.5 days is "this month"; picked dates are not. */
export interface RangeWords {
  /** "this month" / "in these dates": "usable this month", "Longest night this month". */
  readonly now: string;
  /** "in this month" / "in these dates": "None in this month". */
  readonly within: string;
  /** "of the month" / "of these dates": "62% of the month". */
  readonly of: string;
  /** "This month" / "These dates": a heading. */
  readonly title: string;
}

/** The words for a range, so copy never calls picked dates "this month". */
export function rangeWords(range: TimeRange): RangeWords {
  return Math.abs(range.end - range.start - RANGE_MS) < 1
    ? { now: 'this month', within: 'in this month', of: 'of the month', title: 'This month' }
    : {
        now: 'in these dates',
        within: 'in these dates',
        of: 'of these dates',
        title: 'These dates',
      };
}

/**
 * The range's centre for a time: noon UTC of that day. The range follows the time a day at a
 * time, so scores and windows are recomputed once a day of app time, not on every tick.
 */
export function dayCentre(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS + DAY_MS / 2;
}

export function rangeAround(centre: number): TimeRange {
  return { start: centre - RANGE_MS / 2, end: centre + RANGE_MS / 2 };
}

/** The same centre while `time` is inside its range; otherwise the range re-centres on `time`. */
export function recentre(centre: number, time: number): number {
  const { start, end } = rangeAround(centre);
  return time < start || time > end ? time : centre;
}

export interface TimeWindowMs {
  start: number;
  end: number;
  /**
   * The window was already open at the first hour checked, or still open at the last: its true
   * start or end lies outside the hours sampled (a long polar day), so `start` or `end` is only
   * where checking stopped. Shown as "before …" or "after …", never as a firm date.
   */
  openStart?: boolean;
  openEnd?: boolean;
}

export function toWindowMs(window: { start: string; end: string }): TimeWindowMs {
  return { start: Date.parse(window.start), end: Date.parse(window.end) };
}

export type WindowStatus =
  | { kind: 'open'; window: TimeWindowMs; closesInMs: number }
  | { kind: 'upcoming'; window: TimeWindowMs; opensInMs: number }
  | { kind: 'none' };

/**
 * Where the clock stands against the windows: inside one, or waiting for the next one that opens
 * within the range, or neither.
 */
export function windowStatus(
  windows: readonly TimeWindowMs[],
  time: number,
  range: TimeRange,
): WindowStatus {
  const open = windows.find((window) => window.start <= time && time < window.end);
  if (open) return { kind: 'open', window: open, closesInMs: open.end - time };
  const next = [...windows]
    .filter((window) => window.start > time && window.start <= range.end)
    .sort((a, b) => a.start - b.start)[0];
  if (next) return { kind: 'upcoming', window: next, opensInMs: next.start - time };
  return { kind: 'none' };
}

export function windowStatusText(status: WindowStatus): string {
  switch (status.kind) {
    case 'open':
      // An open-ended window's last hour checked is not when it closes.
      return status.window.openEnd
        ? `Window open – still open after ${formatDayMonth(status.window.end)}`
        : `Window open – closes in ${formatDuration(status.closesInMs)}`;
    case 'upcoming':
      return `Window opens in ${formatDuration(status.opensInMs)} (${formatDayMonth(status.window.start)} – ${status.window.openEnd ? 'after ' : ''}${formatDayMonth(status.window.end)})`;
    case 'none':
      return 'No window in this range';
  }
}

/** The window open at `time`, or else the next one to open; null when none is left. */
export function currentOrNextWindow(
  windows: readonly TimeWindowMs[],
  time: number,
): TimeWindowMs | null {
  return (
    [...windows].filter((window) => window.end > time).sort((a, b) => a.start - b.start)[0] ?? null
  );
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** A day boundary on the time bar: UTC midnight, its label, and its place in the run of days. */
export interface DayTick {
  ms: number;
  /** "Sun 15"; the first of a month says its month instead: "1 Dec". */
  label: string;
  /** 0 for the first midnight inside the range, then 1, 2, … (for thinning the labels). */
  index: number;
}

/** Every UTC midnight inside the range, labelled for the time bar's day strip. */
export function dayTicks(range: TimeRange): DayTick[] {
  const ticks: DayTick[] = [];
  let ms = Math.ceil(range.start / DAY_MS) * DAY_MS;
  for (let index = 0; ms <= range.end; index++, ms += DAY_MS) {
    const date = new Date(ms);
    const day = date.getUTCDate();
    const label =
      day === 1
        ? `1 ${MONTHS[date.getUTCMonth()] ?? ''}`
        : `${WEEKDAYS[date.getUTCDay()] ?? ''} ${day}`;
    ticks.push({ ms, label, index });
  }
  return ticks;
}

/**
 * "168.8 h", "1,234 h": hours to one decimal at most (10-minute samples give sixths of an hour;
 * docs/LANDER_RULES.md, "Date range and hours").
 */
export function formatHours(hours: number): string {
  return `${hours.toLocaleString('en-US', { maximumFractionDigits: 1 })} h`;
}

/** "Thu 24 Dec, 00:00 UTC": the time bar's date button and its hover read-out. */
export function formatClockShort(ms: number): string {
  const { day, month, hhmm } = parts(ms);
  return `${WEEKDAYS[new Date(ms).getUTCDay()] ?? ''} ${day} ${month}, ${hhmm} UTC`;
}

/** "2 d 3 h", "11 h", "40 min": a countdown in whole units, for first-time readers. */
export function plainDuration(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / MINUTE_MS);
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  if (hours > 0) return `${hours} h`;
  return `${Math.max(1, minutes)} min`;
}

/** The time bar's status in plain words: a "good time to land" is a window (Sun and Earth up). */
export function goodTimeText(status: WindowStatus): string {
  switch (status.kind) {
    case 'open':
      return status.window.openEnd
        ? `Good time to land now, still on after ${formatDayMonth(status.window.end)}`
        : `Good time to land now, ends in ${plainDuration(status.closesInMs)}`;
    case 'upcoming':
      return `Good time to land starts in ${plainDuration(status.opensInMs)}`;
    case 'none':
      return 'No good time in these dates';
  }
}
