import { describe, expect, it } from 'vitest';
import {
  dateRangeError,
  dateRangeText,
  delayRange,
  readDateRange,
  toTimeRange,
} from '../../../../src/features/missions/dateRange';
import { DAY_MS } from '../../../../src/utils/time';

const DEC = { startMs: Date.UTC(2026, 11, 12), stopMs: Date.UTC(2026, 11, 25) };

describe('the date range', () => {
  it('runs from 00:00 UTC on the start date to 00:00 UTC after the stop date', () => {
    expect(toTimeRange(DEC)).toEqual({
      start: Date.UTC(2026, 11, 12),
      end: Date.UTC(2026, 11, 26),
    });
    expect(dateRangeText(DEC)).toBe('12 Dec 2026 to 25 Dec 2026 (UTC)');
    // One day is a whole day.
    const one = toTimeRange({ startMs: DEC.startMs, stopMs: DEC.startMs });
    expect(one.end - one.start).toBe(DAY_MS);
  });

  it('reads the two date fields, and waits while either is empty', () => {
    expect(readDateRange('2026-12-12', '2026-12-25')).toEqual({ range: DEC });
    expect(readDateRange('2026-12-12', '')).toBeNull();
    expect(readDateRange('2026-02-30', '2026-03-02')).toEqual({
      error: 'Start date: That date does not exist.',
    });
  });

  it('refuses a stop before the start, more than 12 months, and dates outside 1990–2100', () => {
    expect(readDateRange('2026-12-25', '2026-12-12')).toEqual({
      error: 'The stop date is before the start date.',
    });
    // 12 months exactly is fine; a day more is not.
    expect(readDateRange('2027-01-01', '2027-12-31')).toEqual({
      range: { startMs: Date.UTC(2027, 0, 1), stopMs: Date.UTC(2027, 11, 31) },
    });
    expect(readDateRange('2027-01-01', '2028-01-01')).toEqual({ error: 'Pick at most 12 months.' });
    expect(readDateRange('1989-12-31', '1990-01-05')).toEqual({
      error: 'Start date: Choose a date from 1 Jan 1990 to 31 Dec 2100.',
    });
  });

  it('delays both dates by a week, or by a calendar month with the day clamped', () => {
    expect(delayRange(DEC, 'week')).toEqual({
      startMs: Date.UTC(2026, 11, 19),
      stopMs: Date.UTC(2027, 0, 1),
    });
    expect(
      delayRange({ startMs: Date.UTC(2027, 0, 31), stopMs: Date.UTC(2027, 2, 31) }, 'month'),
    ).toEqual({
      startMs: Date.UTC(2027, 1, 28),
      stopMs: Date.UTC(2027, 3, 30),
    });
    expect(
      dateRangeError(
        delayRange({ startMs: Date.UTC(2100, 11, 1), stopMs: Date.UTC(2100, 11, 20) }, 'month'),
      ),
    ).toBe('Choose dates from 1 Jan 1990 to 31 Dec 2100.');
  });
});
