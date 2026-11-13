import { describe, expect, it } from 'vitest';
import {
  addMonthsUtc,
  dayTicks,
  DAY_MS,
  HOUR_MS,
  RANGE_MS,
  TIME_MAX_MS,
  TIME_MIN_MS,
  clampTime,
  currentOrNextWindow,
  floorToMinute,
  formatAmman,
  formatClock,
  formatCountdown,
  formatDuration,
  formatRangeUtc,
  rangeWords,
  parseUtcInput,
  dayCentre,
  rangeAround,
  recentre,
  toInputValues,
  windowStatus,
  windowStatusText,
  formatWindowDays,
  formatWindowLength,
  formatWindowRange,
  insideRangeMs,
  tenthsOfDayDown,
} from '../../../src/utils/time';
import { formatDays } from '../../../src/data/demoData';

const T = Date.UTC(2026, 9, 26, 14, 5, 42); // 26 Oct 2026 14:05:42 UTC

describe('formatting', () => {
  it('shows the clock to the minute, in UTC', () => {
    expect(formatClock(T)).toBe('26 Oct 2026 · 14:05 UTC');
    expect(floorToMinute(T)).toBe(Date.UTC(2026, 9, 26, 14, 5));
  });

  it('gives the same moment in Amman (UTC+3), crossing midnight correctly', () => {
    expect(formatAmman(T)).toBe('26 Oct 2026 · 17:05 Amman (UTC+3)');
    expect(formatAmman(Date.UTC(2026, 11, 31, 22, 30))).toBe('1 Jan 2027 · 01:30 Amman (UTC+3)');
  });

  it('formats a window range and durations', () => {
    expect(formatRangeUtc(Date.UTC(2026, 10, 18, 6), Date.UTC(2026, 10, 27, 18))).toBe(
      '18 Nov 06:00 to 27 Nov 18:00 UTC',
    );
    expect(formatDuration(3 * DAY_MS + 4 * HOUR_MS + 59_000)).toBe('3d 4h');
    expect(formatDuration(5 * HOUR_MS + 12 * 60_000)).toBe('5h 12m');
    expect(formatDuration(12 * 60_000)).toBe('12m');
    expect(formatDuration(30_000)).toBe('under 1m');
  });

  it('calls the time bar’s 29.5 days "this month", and picked dates never so', () => {
    expect(rangeWords(rangeAround(dayCentre(T))).now).toBe('this month');
    expect(rangeWords(rangeAround(dayCentre(T))).of).toBe('of the month');
    const picked = rangeWords({ start: Date.UTC(2026, 11, 12), end: Date.UTC(2027, 0, 11) });
    expect(picked).toEqual({
      now: 'in these dates',
      within: 'in these dates',
      of: 'of these dates',
      title: 'These dates',
    });
  });

  it('spaces the units of a forecast countdown: "2 d 4 h"', () => {
    expect(formatCountdown(2 * DAY_MS + 4 * HOUR_MS + 59_000)).toBe('2 d 4 h');
    expect(formatCountdown(5 * HOUR_MS + 12 * 60_000)).toBe('5 h 12 m');
    expect(formatCountdown(12 * 60_000)).toBe('12 m');
    expect(formatCountdown(30_000)).toBe('under 1 m');
  });

  it('round-trips through the date and time inputs', () => {
    const values = toInputValues(T);
    expect(values).toEqual({ date: '2026-10-26', time: '14:05' });
    expect(parseUtcInput(values.date, values.time)).toEqual({ ok: true, ms: floorToMinute(T) });
  });
});

describe('window lengths: one number for one thing (2026-11-13 fix)', () => {
  // A 315-hour window is 13.125 days: one place rounded it to 13.1, another to 13.2.
  const window = { start: Date.UTC(2026, 10, 10), end: Date.UTC(2026, 10, 10) + 315 * HOUR_MS };

  it('rounds every day count down to one decimal, the same way', () => {
    expect(tenthsOfDayDown(13.125)).toBe(13.1);
    expect(tenthsOfDayDown(2.99)).toBe(2.9);
    expect(tenthsOfDayDown(3)).toBe(3);
    expect(formatWindowDays(window)).toBe('13.1 days');
    expect(formatDays((315 * HOUR_MS) / DAY_MS)).toBe('13.1 days');
  });

  it('adds the part inside the month when a window runs past it', () => {
    // Delta's window, 16 Nov 23:00 to 29 Nov 20:00 (12 d 21 h), with the month ending 27 Nov 00:00
    // (10 d 1 h inside): both numbers rounded down, side by side.
    const delta = { start: Date.UTC(2026, 10, 16, 23), end: Date.UTC(2026, 10, 29, 20) };
    const month = { start: Date.UTC(2026, 10, 27, 0) - RANGE_MS, end: Date.UTC(2026, 10, 27, 0) };
    expect(insideRangeMs(delta, month)).toBe(month.end - delta.start);
    expect(formatWindowLength(delta, month)).toBe('12.8 days (10 days in this month)');
  });

  it('adds the part inside the month even when the window runs only an hour past it', () => {
    // QA case: 14 days of which 13.9 (rounded down) fall inside; one number alone would disagree.
    const month = { start: Date.UTC(2026, 11, 27, 6) - RANGE_MS, end: Date.UTC(2026, 11, 27, 6) };
    const window = { start: Date.UTC(2026, 11, 13, 7), end: Date.UTC(2026, 11, 27, 7) };
    expect(formatWindowLength(window, month)).toBe('14 days (13.9 days in this month)');
    // When both round to the same tenth there is nothing to add.
    const close = { start: Date.UTC(2026, 11, 13, 7), end: Date.UTC(2026, 11, 27, 6, 30) };
    expect(formatWindowLength(close, month)).toBe('13.9 days');
    // Picked dates are never called "this month".
    const picked = { start: month.start, end: month.start + 20 * DAY_MS };
    expect(formatWindowLength(window, picked)).toMatch(/^14 days \([\d.]+ days in these dates\)$/);
  });

  it('shows only the whole length when the window lies inside the month', () => {
    const month = rangeAround(Date.UTC(2026, 10, 15, 12));
    expect(formatWindowLength(window, month)).toBe('13.1 days');
    expect(insideRangeMs({ start: 0, end: HOUR_MS }, month)).toBe(0);
  });
});

describe('open-ended windows (a long polar day)', () => {
  const start = Date.UTC(2026, 9, 31, 12);
  const end = Date.UTC(2026, 11, 30, 0);
  const open = { start, end, openStart: true, openEnd: true };

  it('says "before" and "after" instead of firm dates, and "over" for the length', () => {
    expect(formatWindowRange({ start, end })).toBe('31 Oct 12:00 to 30 Dec 00:00 UTC');
    expect(formatWindowRange(open)).toBe('before 31 Oct 12:00 to after 30 Dec 00:00 UTC');
    expect(formatWindowDays({ start, end })).toBe('59.5 days');
    expect(formatWindowDays(open)).toBe('over 59.5 days');
  });

  it('never counts down to the close of a window that runs past the hours checked', () => {
    const range = rangeAround(Date.UTC(2026, 10, 15, 12));
    const status = windowStatus([open], Date.UTC(2026, 10, 15), range);
    expect(windowStatusText(status)).toBe('Window open – still open after 30 Dec');
  });
});

describe('parseUtcInput', () => {
  it('rejects malformed, impossible and out-of-range input with a reason', () => {
    expect(parseUtcInput('26/10/2026', '14:05')).toMatchObject({ ok: false });
    expect(parseUtcInput('', '14:05')).toEqual({
      ok: false,
      error: 'Enter a complete date.',
      field: 'date',
    });
    expect(parseUtcInput('2026-10-26', '25:00')).toEqual({
      ok: false,
      error: 'Enter the time as HH:MM, 24-hour.',
      field: 'time',
    });
    expect(parseUtcInput('2026-02-31', '10:00')).toEqual({
      ok: false,
      error: 'That date does not exist.',
      field: 'date',
    });
    expect(parseUtcInput('1989-12-31', '23:59')).toMatchObject({ ok: false });
    expect(parseUtcInput('2101-01-01', '00:00')).toMatchObject({ ok: false });
  });

  it('accepts the ends of the range', () => {
    expect(parseUtcInput('1990-01-01', '00:00')).toEqual({ ok: true, ms: TIME_MIN_MS });
    expect(parseUtcInput('2100-12-31', '23:59')).toEqual({ ok: true, ms: TIME_MAX_MS });
    expect(clampTime(TIME_MAX_MS + DAY_MS)).toBe(TIME_MAX_MS);
  });
});

describe('the time bar range', () => {
  it('covers 29.5 days centred on its centre, and re-centres only when the time leaves it', () => {
    const range = rangeAround(T);
    expect(range.end - range.start).toBe(RANGE_MS);
    expect(recentre(T, T + 10 * DAY_MS)).toBe(T);
    expect(recentre(T, T + 20 * DAY_MS)).toBe(T + 20 * DAY_MS);
    expect(recentre(T, T - 15 * DAY_MS)).toBe(T - 15 * DAY_MS);
  });
});

describe('windowStatus', () => {
  const windows = [
    { start: Date.UTC(2026, 10, 18, 6), end: Date.UTC(2026, 10, 27, 18) },
    { start: Date.UTC(2026, 11, 17, 4), end: Date.UTC(2026, 11, 25, 16) },
  ];

  it('counts down to the next window in range', () => {
    const now = Date.UTC(2026, 10, 15, 2);
    const status = windowStatus(windows, now, rangeAround(now));
    expect(status).toMatchObject({ kind: 'upcoming', opensInMs: 3 * DAY_MS + 4 * HOUR_MS });
    expect(windowStatusText(status)).toBe('Window opens in 3d 4h (18 Nov – 27 Nov)');
  });

  it('counts down to the close while a window is open', () => {
    const now = Date.UTC(2026, 10, 25, 12);
    const status = windowStatus(windows, now, rangeAround(now));
    expect(windowStatusText(status)).toBe('Window open – closes in 2d 6h');
  });

  it('says so when no window opens in the range', () => {
    const now = Date.UTC(2026, 9, 1);
    expect(windowStatusText(windowStatus(windows, now, rangeAround(now)))).toBe(
      'No window in this range',
    );
  });

  it('finds the open or next window, and none once both have passed', () => {
    expect(currentOrNextWindow(windows, Date.UTC(2026, 10, 20))).toBe(windows[0]);
    expect(currentOrNextWindow(windows, Date.UTC(2026, 10, 30))).toBe(windows[1]);
    expect(currentOrNextWindow(windows, Date.UTC(2027, 0, 1))).toBeNull();
  });
});

describe('dayCentre', () => {
  it("centres the range on noon UTC of the time's day, so it moves a day at a time", () => {
    expect(dayCentre(Date.parse('2026-11-15T00:00:00Z'))).toBe(Date.parse('2026-11-15T12:00:00Z'));
    expect(dayCentre(Date.parse('2026-11-15T23:59:00Z'))).toBe(Date.parse('2026-11-15T12:00:00Z'));
    expect(dayCentre(Date.parse('2026-11-16T00:01:00Z'))).toBe(Date.parse('2026-11-16T12:00:00Z'));
  });
});

describe('dayTicks', () => {
  it('marks every UTC midnight in the range, with a weekday, and the month on the 1st', () => {
    const range = {
      start: Date.parse('2026-11-28T12:00:00Z'),
      end: Date.parse('2026-12-03T06:00:00Z'),
    };
    expect(dayTicks(range).map((tick) => tick.label)).toEqual([
      'Sun 29',
      'Mon 30',
      '1 Dec',
      'Wed 2',
      'Thu 3',
    ]);
    const first = dayTicks(range)[0];
    expect(first?.ms).toBe(Date.parse('2026-11-29T00:00:00Z'));
    expect(first?.index).toBe(0);
  });
});

describe('addMonthsUtc', () => {
  it('keeps the day, or moves it to the last day of a shorter month', () => {
    expect(addMonthsUtc(Date.UTC(2027, 0, 31, 6), 1)).toBe(Date.UTC(2027, 1, 28, 6));
    expect(addMonthsUtc(Date.UTC(2028, 0, 31), 1)).toBe(Date.UTC(2028, 1, 29));
    expect(addMonthsUtc(Date.UTC(2026, 10, 15, 2), 2)).toBe(Date.UTC(2027, 0, 15, 2));
    expect(addMonthsUtc(Date.UTC(2027, 2, 31), -1)).toBe(Date.UTC(2027, 1, 28));
    expect(addMonthsUtc(Date.UTC(2026, 10, 15), 12)).toBe(Date.UTC(2027, 10, 15));
  });
});
