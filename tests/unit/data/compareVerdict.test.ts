import { describe, expect, it } from 'vitest';
import { compareVerdict } from '../../../src/data/compareVerdict';
import { DEFAULT_DEMO_MISSION, assessSky, type RankedSite } from '../../../src/data/demoData';
import { SITES } from '../../../src/services/sites';
import type { SiteSky } from '../../../src/utils/skyVisibility';

const RANGE = { start: 0, end: 29.5 * 86_400_000 };

/**
 * A compared entry for a real site (0 IM-1 Odysseus, 1 IM-2 Athena, 2 Blue Ghost Mission 1,
 * 3 Chandrayaan-3 Vikram), with a made-up window length and Earth share.
 */
function entry(index: number, windowDays: number, earthPct = 100): RankedSite {
  const site = SITES[index];
  if (!site) throw new Error('no site');
  const sky: SiteSky = {
    sunPct: 47,
    earthPct,
    sunHours: 0,
    earthHours: 0,
    bothHours: 0,
    longestSunlitDays: windowDays,
    longestWindowDays: earthPct > 0 ? windowDays : 0,
    windows: [],
  };
  const assessment = assessSky(sky, DEFAULT_DEMO_MISSION, RANGE);
  return { site, assessment, rank: assessment.suitable ? 1 : null };
}

describe('compareVerdict', () => {
  it('needs two sites', () => {
    expect(compareVerdict([entry(0, 10)])).toBeNull();
  });

  it('names the longest usable window, and which sees the Earth most', () => {
    expect(compareVerdict([entry(0, 13.9, 100), entry(1, 9.1, 60)])).toBe(
      'IM-1 Odysseus has the longest usable window: 13.9 days vs 9.1 days at IM-2 Athena. IM-1 Odysseus sees the Earth most (100% of the month vs 60%).',
    );
  });

  it('calls near-equal windows level', () => {
    expect(compareVerdict([entry(0, 10.2), entry(1, 10)])).toBe(
      'IM-1 Odysseus and IM-2 Athena have about the same usable window (10.2 days and 10 days).',
    );
  });

  it('says why an unsuitable site cannot be recommended', () => {
    expect(compareVerdict([entry(0, 10), entry(2, 10, 0)])).toBe(
      'IM-1 Odysseus is the only one that suits the mission. Blue Ghost Mission 1 is not suitable: no line of sight to Earth.',
    );
    expect(compareVerdict([entry(2, 10, 0), entry(3, 10, 0)])).toMatch(
      /^None of these suits the mission in this month\./,
    );
    // Picked dates are never called "this month".
    const picked = { start: Date.UTC(2026, 11, 12), end: Date.UTC(2026, 11, 26) };
    expect(compareVerdict([entry(2, 10, 0), entry(3, 10, 0)], picked)).toMatch(
      /^None of these suits the mission in these dates\./,
    );
  });
});
