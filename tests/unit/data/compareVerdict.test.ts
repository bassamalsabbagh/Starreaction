import { describe, expect, it } from 'vitest';
import { compareVerdict } from '../../../src/data/compareVerdict';
import {
  DEFAULT_DEMO_MISSION,
  DEMO_SITES,
  assessSky,
  type RankedDemoSite,
} from '../../../src/data/demoData';
import type { SiteSky } from '../../../src/utils/skyVisibility';

const RANGE = { start: 0, end: 29.5 * 86_400_000 };

/** A compared entry for a demo site, with the given window length and Earth share. */
function entry(index: number, windowDays: number, earthPct = 100): RankedDemoSite {
  const site = DEMO_SITES[index];
  if (!site) throw new Error('no site');
  const sky: SiteSky = {
    sunPct: 47,
    earthPct,
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
      'Demo Site Alpha has the longest usable window: 13.9 days vs 9.1 days at Demo Site Bravo. Demo Site Alpha sees the Earth most (100% of the month vs 60%).',
    );
  });

  it('calls near-equal windows level', () => {
    expect(compareVerdict([entry(0, 10.2), entry(1, 10)])).toBe(
      'Demo Site Alpha and Demo Site Bravo have about the same usable window (10.2 days and 10 days).',
    );
  });

  it('says why an unsuitable site cannot be recommended', () => {
    expect(compareVerdict([entry(0, 10), entry(6, 10, 0)])).toBe(
      'Demo Site Alpha is the only one that suits the mission. Demo Site Golf is not suitable: no line of sight to Earth.',
    );
    expect(compareVerdict([entry(6, 10, 0), entry(4, 10, 0)])).toMatch(
      /^None of these suits the mission in this month\./,
    );
  });
});
