import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEMO_MISSION,
  type DemoSite,
  type RankedDemoSite,
} from '../../../../src/data/demoData';
import { rangeText, slipSummary } from '../../../../src/features/missions/slipSummary';
import { DAY_MS, formatRangeUtc, rangeAround } from '../../../../src/utils/time';

const RANGE = rangeAround(Date.UTC(2027, 2, 15, 12));

function entry(
  name: string,
  usableDays: number,
  rank: number | null,
  window: { start: number; end: number } | null = null,
): RankedDemoSite {
  const site: DemoSite = { id: name.toLowerCase().replace(/\s/g, '-'), name, lat: 0, lon: 0 };
  return {
    site,
    rank,
    assessment: {
      sky: {
        sunPct: 50,
        earthPct: 50,
        longestSunlitDays: usableDays,
        longestWindowDays: usableDays,
        windows: window ? [window] : [],
      },
      usableDays,
      checks: [],
      suitable: rank !== null,
      failTitles: [],
      bestWindow: window,
    },
  };
}

describe('rangeText', () => {
  it('names the range in UTC, with the year once or on both ends across a new year', () => {
    expect(rangeText(RANGE)).toBe('28 Feb to 30 Mar 2027');
    expect(rangeText(rangeAround(Date.UTC(2026, 11, 31, 12)))).toBe('16 Dec 2026 to 15 Jan 2027');
  });
});

describe('slipSummary', () => {
  it('names the longest usable window from the results, whatever the list order', () => {
    const window = { start: RANGE.start + 2 * DAY_MS, end: RANGE.start + 12 * DAY_MS };
    // Listed by name, so the longest is not first.
    const ranked = [
      entry('Demo Site Alpha', 4.25, 1),
      entry('Demo Site Bravo', 9.87, 2, window),
      entry('Demo Site Golf', 0, null),
    ];
    expect(slipSummary(ranked, DEFAULT_DEMO_MISSION, RANGE)).toBe(
      `From 28 Feb to 30 Mar 2027 (UTC), Demo Site Bravo has the longest usable window for Demo Mission A: 9.8 days inside this range (best window ${formatRangeUtc(window.start, window.end)}). 2 of 3 demo sites pass all the checks.`,
    );
  });

  it('says "passes" for one site, and breaks ties by name', () => {
    const ranked = [entry('Demo Site Echo', 5, 1), entry('Demo Site Golf', 0, null)];
    expect(slipSummary(ranked, DEFAULT_DEMO_MISSION, RANGE)).toMatch(
      /Demo Site Echo has the longest usable window for Demo Mission A: 5 days inside this range\. 1 of 2 demo sites passes all the checks\.$/,
    );
    const tied = [entry('Demo Site Hotel', 5, 1), entry('Demo Site Delta', 5, 2)];
    expect(slipSummary(tied, DEFAULT_DEMO_MISSION, RANGE)).toContain('Demo Site Delta has');
  });

  it('says so when no site passes', () => {
    expect(slipSummary([entry('Demo Site Golf', 0, null)], DEFAULT_DEMO_MISSION, RANGE)).toBe(
      "From 28 Feb to 30 Mar 2027 (UTC), no demo site passes all the checks for Demo Mission A. A site's Other dates shows the months ahead.",
    );
  });
});
