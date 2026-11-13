import { describe, expect, it } from 'vitest';
import {
  bracketDates,
  bracketPlace,
  daysBetween,
  monthTicks,
  moveBracket,
} from '../../../../src/features/compare/bracket';
import { DAY_MS, RANGE_MS } from '../../../../src/utils/time';

const DEC12 = Date.UTC(2026, 11, 12);
const SPAN = { from: DEC12, to: Date.UTC(2027, 11, 12) };

describe('the Timeline bracket', () => {
  it('reads picked dates as they are, and the time bar’s 29.5 days as 30 whole days', () => {
    expect(bracketDates({ start: DEC12, end: Date.UTC(2026, 11, 26) })).toEqual({
      startMs: DEC12,
      stopMs: Date.UTC(2026, 11, 25),
    });
    const time = Date.UTC(2026, 10, 15, 12) - RANGE_MS / 2;
    const dates = bracketDates({ start: time, end: time + RANGE_MS });
    expect(dates.startMs).toBe(Date.UTC(2026, 9, 31));
    expect(daysBetween(dates.startMs, dates.stopMs) + 1).toBe(30);
  });

  it('moves the start and stop together by whole days', () => {
    const dates = { startMs: Date.UTC(2027, 0, 10), stopMs: Date.UTC(2027, 0, 23) };
    expect(moveBracket(dates, 3, SPAN)).toEqual({
      startMs: Date.UTC(2027, 0, 13),
      stopMs: Date.UTC(2027, 0, 26),
    });
    // Part days round to whole ones.
    expect(moveBracket(dates, -1.4, SPAN).startMs).toBe(Date.UTC(2027, 0, 9));
  });

  it('keeps the dates inside the 12 months at both ends', () => {
    const dates = { startMs: Date.UTC(2026, 11, 20), stopMs: Date.UTC(2027, 0, 2) };
    expect(moveBracket(dates, -30, SPAN)).toEqual({
      startMs: DEC12,
      stopMs: DEC12 + 13 * DAY_MS,
    });
    const last = moveBracket(dates, 1000, SPAN);
    expect(last.stopMs + DAY_MS).toBe(SPAN.to);
    expect(last.stopMs - last.startMs).toBe(13 * DAY_MS);
  });

  it('places a range on the timeline as fractions of the 12 months', () => {
    const place = bracketPlace({ start: DEC12, end: DEC12 + 73 * DAY_MS }, SPAN);
    expect(place.left).toBe(0);
    expect(place.width).toBeCloseTo(73 / 365, 9);
  });
});

describe('the Timeline’s month ticks', () => {
  it('fall on the 1st of each month inside the 12 months, named by that month', () => {
    // From 12 Dec 2026: the first tick is 1 Jan 2027, not 12 Dec labelled "Dec".
    const ticks = monthTicks(SPAN);
    expect(ticks[0]).toEqual({
      at: Date.UTC(2027, 0, 1),
      left: 20 / 365,
      label: 'Jan 2027',
    });
    expect(ticks.map((tick) => tick.label)).toEqual([
      'Jan 2027',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ]);
    expect(ticks[ticks.length - 1]?.at).toBe(Date.UTC(2027, 11, 1));
  });

  it('start on the origin when it is the 1st, with its year', () => {
    const ticks = monthTicks({ from: Date.UTC(2026, 10, 1), to: Date.UTC(2027, 10, 1) });
    expect(ticks[0]).toMatchObject({ left: 0, label: 'Nov 2026' });
    expect(ticks).toHaveLength(12);
    expect(ticks[2]?.label).toBe('Jan 2027');
  });
});

describe('the bracket at the end of the app’s dates', () => {
  it('never moves past 31 Dec 2100', () => {
    const span = { from: Date.UTC(2100, 6, 1), to: Date.UTC(2101, 6, 1) };
    const dates = { startMs: Date.UTC(2100, 6, 1), stopMs: Date.UTC(2100, 6, 14) };
    const moved = moveBracket(dates, 1000, span);
    expect(moved.stopMs).toBe(Date.UTC(2100, 11, 31));
    expect(moved.stopMs - moved.startMs).toBe(13 * DAY_MS);
  });
});
