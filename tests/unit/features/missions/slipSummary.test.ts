import { describe, expect, it } from 'vitest';
import { DEFAULT_DEMO_MISSION, type RankedSite } from '../../../../src/data/demoData';
import { rangeText, slipSummary } from '../../../../src/features/missions/slipSummary';
import { findSite, type Site } from '../../../../src/services/sites';
import { DAY_MS, formatRangeUtc, rangeAround } from '../../../../src/utils/time';

const RANGE = rangeAround(Date.UTC(2027, 2, 15, 12));

function site(id: string): Site {
  const found = findSite(id);
  if (!found) throw new Error(`missing site ${id}`);
  return found;
}

/** A ranked entry for a real site, with a made-up usable window (only the sentence is tested). */
function entry(
  id: string,
  usableDays: number,
  rank: number | null,
  window: { start: number; end: number } | null = null,
): RankedSite {
  return {
    site: site(id),
    rank,
    assessment: {
      sky: {
        sunPct: 50,
        earthPct: 50,
        sunHours: 0,
        earthHours: 0,
        bothHours: 0,
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
    // Picked dates end at 00:00 after the stop date: that day is not named.
    expect(rangeText({ start: Date.UTC(2026, 11, 12), end: Date.UTC(2026, 11, 26) })).toBe(
      '12 Dec to 25 Dec 2026',
    );
    expect(rangeText({ start: Date.UTC(2026, 11, 1), end: Date.UTC(2027, 0, 1) })).toBe(
      '1 Dec to 31 Dec 2026',
    );
  });
});

describe('slipSummary', () => {
  it('names the longest usable window from the results, whatever the list order', () => {
    const window = { start: RANGE.start + 2 * DAY_MS, end: RANGE.start + 12 * DAY_MS };
    // Listed by name, so the longest is not first.
    const ranked = [entry('im1', 4.25, 1), entry('im2', 9.87, 2, window), entry('bg1', 0, null)];
    expect(slipSummary(ranked, DEFAULT_DEMO_MISSION, RANGE)).toBe(
      `From 28 Feb to 30 Mar 2027 (UTC), IM-2 Athena has the longest usable window for Demo Mission A: 9.8 days inside this range (best window ${formatRangeUtc(window.start, window.end)}). 2 of 3 sites pass all the checks.`,
    );
  });

  it('says "passes" for one site, and breaks ties by name', () => {
    const ranked = [entry('ch3', 5, 1), entry('bg1', 0, null)];
    expect(slipSummary(ranked, DEFAULT_DEMO_MISSION, RANGE)).toMatch(
      /Chandrayaan-3 Vikram has the longest usable window for Demo Mission A: 5 days inside this range\. 1 of 2 sites passes all the checks\.$/,
    );
    const tied = [entry('im1', 5, 1), entry('bg1', 5, 2)];
    expect(slipSummary(tied, DEFAULT_DEMO_MISSION, RANGE)).toContain('Blue Ghost Mission 1 has');
  });

  it('says so when no site passes', () => {
    expect(slipSummary([entry('bg1', 0, null)], DEFAULT_DEMO_MISSION, RANGE)).toBe(
      "From 28 Feb to 30 Mar 2027 (UTC), no site passes all the checks for Demo Mission A. A site's Other dates shows the months ahead.",
    );
  });
});
