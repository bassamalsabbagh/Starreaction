import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEMO_MISSION,
  DEMO_MISSIONS,
  assessSky,
  bestSite,
  findDemoMission,
  formatDays,
  formatShare,
  rankSites,
  verdictText,
  type DemoMission,
} from '../../../src/data/demoData';
import { SITES } from '../../../src/services/sites';
import { hourlySky, sampledSpan, siteSky, type SiteSky } from '../../../src/utils/skyVisibility';
import { DAY_MS, dayCentre, rangeAround } from '../../../src/utils/time';

const RANGE = rangeAround(dayCentre(Date.parse('2026-11-15T00:00:00Z')));

function mission(id: string): DemoMission {
  const found = findDemoMission(id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

/** A made-up sky for the pure checks: 12 sunlit days, the Earth always up (708 hours). */
function sky(overrides: Partial<SiteSky> = {}): SiteSky {
  return {
    sunPct: 47,
    earthPct: 100,
    sunHours: 333,
    earthHours: 708,
    bothHours: 333,
    longestSunlitDays: 12,
    longestWindowDays: 12,
    windows: [{ start: RANGE.start + DAY_MS, end: RANGE.start + 13 * DAY_MS }],
    ...overrides,
  };
}

describe('demo fixtures', () => {
  it('has three demo missions, each named as demo (the sites are real: data/sites.json)', () => {
    expect(DEMO_MISSIONS.map((entry) => entry.id)).toEqual([
      'demo-mission-a',
      'demo-mission-b',
      'demo-mission-c',
    ]);
    for (const entry of DEMO_MISSIONS) expect(entry.name).toMatch(/^Demo Mission /);
    expect(DEFAULT_DEMO_MISSION.id).toBe('demo-mission-a');
    expect(findDemoMission('nope')).toBeUndefined();
  });
});

describe('formatDays and formatShare', () => {
  it('rounds days down to one decimal, so a near miss reads as one', () => {
    expect(formatDays(2.99)).toBe('2.9 days');
    expect(formatDays(3)).toBe('3 days');
  });

  it('never shows a small share as none', () => {
    expect(formatShare(0)).toBe('0%');
    expect(formatShare(0.2)).toBe('<1%');
    expect(formatShare(61.6)).toBe('62%');
  });
});

describe('assessSky', () => {
  it('passes power and comms when the window lasts and the Earth rises', () => {
    const result = assessSky(sky(), DEFAULT_DEMO_MISSION, RANGE);
    expect(result.suitable).toBe(true);
    expect(result.usableDays).toBe(12);
    expect(result.checks.map((check) => [check.label, check.passes])).toEqual([
      ['Power', true],
      ['Comms', true],
      ['Usable window', true],
    ]);
    expect(result.bestWindow).toEqual(sky().windows[0]);
    expect(verdictText(result, DEFAULT_DEMO_MISSION)).toBe('Power and comms OK for Demo Mission A');
  });

  it('uses the Sun-and-Earth window without a relay, and the sunlit stretch with one', () => {
    const noOverlap = sky({ earthPct: 40, longestWindowDays: 0 });
    const a = assessSky(noOverlap, DEFAULT_DEMO_MISSION, RANGE);
    expect(a.usableDays).toBe(0);
    expect(a.failTitles).toEqual(['Not enough time with Sun and Earth both up']);
    const b = assessSky(noOverlap, mission('demo-mission-b'), RANGE);
    expect(b.usableDays).toBe(12);
    expect(b.suitable).toBe(true);
  });

  it('fails comms on the far side without a relay, and names each failure in check order', () => {
    const farSide = sky({ earthPct: 0, longestWindowDays: 0 });
    const result = assessSky(farSide, DEFAULT_DEMO_MISSION, RANGE);
    expect(result.suitable).toBe(false);
    // Power is the Sun only, so it passes here: the Sun is up long enough.
    expect(result.failTitles).toEqual([
      'No line of sight to Earth',
      'Not enough time with Sun and Earth both up',
    ]);
    expect(verdictText(result, DEFAULT_DEMO_MISSION)).toBe(
      'Not suitable for Demo Mission A: No line of sight to Earth; not enough time with Sun and Earth both up',
    );
    expect(result.checks.map((check) => check.detail)).toEqual([
      'Longest sunlit stretch: 12 days (needs 3), Sun at least 5° up',
      'Earth at least 5° up for 0% of the month',
      'Longest stretch with the Sun and Earth both up: 0 days (needs 3)',
    ]);
  });

  it('names each check for what it measures: Power the Sun, Comms the Earth, the window both', () => {
    // The Sun is up 12 days but never long enough together with the Earth.
    const result = assessSky(
      sky({ earthPct: 40, longestWindowDays: 1 }),
      DEFAULT_DEMO_MISSION,
      RANGE,
    );
    expect(result.checks.map((check) => [check.id, check.label, check.passes])).toEqual([
      ['sunlight', 'Power', true],
      ['earth', 'Comms', true],
      ['window', 'Usable window', false],
    ]);
    // A relay mission: the usable window is the power stretch, so it is not listed twice.
    const relay = assessSky(sky({ longestSunlitDays: 2 }), mission('demo-mission-b'), RANGE);
    expect(relay.checks.map((check) => check.id)).toEqual(['sunlight', 'earth']);
    expect(relay.failTitles).toEqual(['Not enough sunlight for its power']);
  });

  it('passes the same places as before the split: a usable window needs both kinds of time', () => {
    for (const [sunDays, windowDays, earthPct] of [
      [12, 12, 50],
      [12, 2, 50],
      [2, 2, 50],
      [12, 0, 0],
      [3, 3, 1],
    ] as const) {
      const result = assessSky(
        sky({ longestSunlitDays: sunDays, longestWindowDays: windowDays, earthPct }),
        DEFAULT_DEMO_MISSION,
        RANGE,
      );
      // Before: the power stretch (both up) and the Earth up at some point.
      expect(result.suitable).toBe(windowDays >= 3 && earthPct > 0);
    }
  });

  it('fails power when the stretch is shorter than the days needed', () => {
    const short = sky({ longestSunlitDays: 2.9, longestWindowDays: 2.9 });
    const result = assessSky(short, DEFAULT_DEMO_MISSION, RANGE);
    expect(result.checks[0]?.passes).toBe(false);
    expect(result.checks[0]?.detail).toContain('2.9 days (needs 3)');
  });
});

describe('rankSites', () => {
  // Made-up skies on three real sites: only the ranking rule is under test here.
  const skies = new Map([
    ['im1', sky({ longestWindowDays: 10, sunHours: 319, earthHours: 708, bothHours: 319 })],
    ['im2', sky({ longestWindowDays: 12, sunHours: 354, earthHours: 425, bothHours: 300 })],
    ['bg1', sky({ earthPct: 0, earthHours: 0, bothHours: 0, longestWindowDays: 0 })],
  ]);
  const sites = SITES.filter((site) => skies.has(site.id));
  const ids = (order: Parameters<typeof rankSites>[4]) =>
    rankSites(sites, DEFAULT_DEMO_MISSION, skies, RANGE, order).map((entry) => [
      entry.site.id,
      entry.rank,
    ]);

  it('lists suitable sites first by their longest usable window, numbered; the rest unnumbered', () => {
    expect(ids('window')).toEqual([
      ['im2', 1],
      ['im1', 2],
      ['bg1', null],
    ]);
  });

  it('names the longest usable window "best", whatever the order', () => {
    for (const order of ['window', 'sunHours', 'earthHours', 'bothHours', 'name'] as const) {
      expect(bestSite(rankSites(sites, DEFAULT_DEMO_MISSION, skies, RANGE, order))?.site.id).toBe(
        'im2',
      );
    }
    expect(bestSite([])).toBeUndefined();
  });

  it('can order by hours of Sun, of Earth, of both, or name instead', () => {
    expect(ids('sunHours')[0]).toEqual(['im2', 1]);
    expect(ids('earthHours')[0]).toEqual(['im1', 1]);
    expect(ids('bothHours')[0]).toEqual(['im1', 1]);
    // By name: "IM-1 Odysseus" before "IM-2 Athena"; the unsuitable site stays last.
    expect(ids('name').map(([id]) => id)).toEqual(['im1', 'im2', 'bg1']);
  });

  it('treats a site with no sky as not suitable', () => {
    const ranked = rankSites(SITES.slice(0, 1), DEFAULT_DEMO_MISSION, new Map(), RANGE);
    expect(ranked[0]?.rank).toBeNull();
  });

  it('runs on the real Sun and Earth at the four real landing sites', () => {
    const samples = hourlySky(sampledSpan(RANGE));
    const ranked = (chosen: DemoMission) =>
      rankSites(
        SITES,
        chosen,
        new Map(SITES.map((site) => [site.id, siteSky(samples, site, chosen, RANGE)])),
        RANGE,
      );
    // All four landings face the Earth (near side), and all suit Mission A this month.
    expect(ranked(DEFAULT_DEMO_MISSION).every((entry) => entry.rank !== null)).toBe(true);
    // IM-2 Athena, 84.8° S: the Sun never climbs to Mission C's 10°, so it fails on power.
    const athena = ranked(mission('demo-mission-c')).find((entry) => entry.site.id === 'im2');
    expect(athena?.rank).toBeNull();
    expect(athena?.assessment.sky.sunPct).toBe(0);
    expect(athena?.assessment.failTitles[0]).toBe('Not enough sunlight for its power');
  });
});
