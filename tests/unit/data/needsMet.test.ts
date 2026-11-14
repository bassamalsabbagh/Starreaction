import { describe, expect, it } from 'vitest';
import { DEFAULT_DEMO_MISSION, assessSky, type DemoMission } from '../../../src/data/demoData';
import { formatNeedsMet, formatNeedsMetShort, needsMet } from '../../../src/data/needsMet';
import type { SiteSky } from '../../../src/utils/skyVisibility';
import { DAY_MS } from '../../../src/utils/time';

const RANGE = { start: 0, end: 29.5 * DAY_MS };

/** Mission A's needs with a chosen number of days (no relay: the usable window is Sun + Earth). */
function mission(daysNeeded: number): DemoMission {
  return { ...DEFAULT_DEMO_MISSION, daysNeeded };
}

function result(usableDays: number, daysNeeded: number, open = false) {
  const window = open
    ? { start: 0, end: RANGE.end, openStart: true }
    : { start: DAY_MS, end: DAY_MS + usableDays * DAY_MS };
  const sky: SiteSky = {
    sunPct: 50,
    earthPct: 50,
    sunHours: 0,
    earthHours: 0,
    bothHours: 0,
    longestSunlitDays: usableDays,
    longestWindowDays: usableDays,
    windows: usableDays > 0 ? [window] : [],
  };
  const chosen = mission(daysNeeded);
  return { met: needsMet(assessSky(sky, chosen, RANGE), chosen), chosen };
}

describe('% of mission needs met (LANDER_RULES.md)', () => {
  it('at 100% shows the window and how many times over the need it is', () => {
    const { met, chosen } = result(13.1, 2);
    expect(met.pct).toBe(100);
    expect(formatNeedsMet(met, chosen)).toBe('13.1 d, 6.5× what it needs');
    expect(formatNeedsMetShort(met)).toBe('6.5× what it needs');
  });

  it('caps at 100% and reads exactly enough as 1×', () => {
    const { met, chosen } = result(3, 3);
    expect(met.pct).toBe(100);
    expect(formatNeedsMet(met, chosen)).toBe('3 d, 1× what it needs');
  });

  it('below 100% shows the percentage and what is missing', () => {
    const { met, chosen } = result(1.85, 3);
    expect(met.pct).toBe(61);
    expect(met.missingDays).toBe(1.2);
    expect(formatNeedsMet(met, chosen)).toBe('61% of needs met · 1.2 d short of 3 d');
    expect(formatNeedsMetShort(met)).toBe('61% of needs met');
  });

  it('never rounds a near miss up to met, or its shortfall down to nothing', () => {
    const { met, chosen } = result(2.999, 3);
    expect(met.met).toBe(false);
    expect(met.pct).toBe(99);
    expect(formatNeedsMet(met, chosen)).toBe('99% of needs met · 0.1 d short of 3 d');
  });

  it('says "at least" for an open-ended window (a long polar day)', () => {
    const { met, chosen } = result(29.5, 2, true);
    expect(met.atLeast).toBe(true);
    expect(formatNeedsMet(met, chosen)).toBe('at least 29.5 d, at least 14.7× what it needs');
    const short = result(24, 30, true);
    expect(formatNeedsMet(short.met, short.chosen)).toBe(
      'at least 80% of needs met · 6 d short of 30 d',
    );
  });

  it('shows 0% when there is no usable window at all', () => {
    const { met, chosen } = result(0, 3);
    expect(formatNeedsMet(met, chosen)).toBe('0% of needs met · 3 d short of 3 d');
  });
});
