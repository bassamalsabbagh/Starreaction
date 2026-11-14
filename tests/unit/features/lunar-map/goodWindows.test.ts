import { describe, expect, it } from 'vitest';
import { goodWindows, windowDates } from '../../../../src/features/lunar-map/goodWindows';
import { DAY_MS, HOUR_MS } from '../../../../src/utils/time';

// Made-up mission needs for these tests (not a real lander's).
const MISSION = {
  id: 'custom-test',
  name: 'Test',
  minSunElevationDeg: 0,
  minEarthElevationDeg: 0,
  daysNeeded: 3,
  hasRelay: false,
  custom: true,
};
const IM2 = { lat: -84.7906, lon: 29.1957 };
const FROM = Date.UTC(2026, 10, 15);

describe('windowDates', () => {
  it('covers a window with whole UTC days, the stop date included', () => {
    const start = Date.UTC(2026, 10, 16, 5);
    expect(windowDates({ start, end: Date.UTC(2026, 11, 2, 13) })).toEqual({
      startMs: Date.UTC(2026, 10, 16),
      stopMs: Date.UTC(2026, 11, 2),
    });
    // Ending exactly at midnight: that day is not needed.
    expect(windowDates({ start, end: Date.UTC(2026, 11, 2) }).stopMs).toBe(Date.UTC(2026, 11, 1));
  });
});

describe('goodWindows (our engine, IM-2, six months)', () => {
  const windows = goodWindows(IM2, MISSION, FROM);

  it('lists only windows long enough for the mission, in order, from the start date on', () => {
    expect(windows.length).toBeGreaterThan(0);
    for (const window of windows) {
      expect(window.days).toBeGreaterThanOrEqual(MISSION.daysNeeded);
      expect(window.start).toBeGreaterThanOrEqual(FROM);
      expect(window.end - window.start).toBeCloseTo(window.days * DAY_MS, 0);
    }
    const starts = windows.map((window) => window.start);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });

  it('needs more days, finds fewer windows', () => {
    const longer = goodWindows(IM2, { ...MISSION, daysNeeded: 10 }, FROM);
    expect(longer.length).toBeLessThanOrEqual(windows.length);
    for (const window of longer) expect(window.days).toBeGreaterThanOrEqual(10);
  });

  it('leaves out the window that starts on the dates already shown', () => {
    const first = windows[0];
    if (!first) throw new Error('no window');
    const skipped = goodWindows(IM2, MISSION, FROM, null, null, first.start + HOUR_MS);
    expect(skipped.some((window) => window.start === first.start)).toBe(false);
  });
});
