import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEMO_MISSION,
  DEMO_SITES,
  assessSky,
  bestDemoSite,
  rankDemoSites,
} from '../../../../src/data/demoData';
import { terrainProfileFor } from '../../../../src/data/terrainPatches';
import {
  QUESTION_RANGES_AHEAD,
  answerQuestion,
  findSiteByName,
} from '../../../../src/features/missions/slipQuestion';
import type { SlipQuestion } from '../../../../src/services/slipReading';
import { hourlySky, sampledSpan, siteSky } from '../../../../src/utils/skyVisibility';
import { RANGE_MS, dayCentre, rangeAround, type TimeRange } from '../../../../src/utils/time';

/** The time bar in these tests: 15 Nov 2026, 02:00 UTC. */
const TIME = Date.UTC(2026, 10, 15, 2, 0);
const RANGE = rangeAround(dayCentre(TIME));

function question(overrides: Partial<SlipQuestion> = {}): SlipQuestion {
  return { about: 'when', siteName: null, from: null, to: null, ...overrides };
}

function answer(text: string, overrides: Partial<SlipQuestion>, now = TIME) {
  return answerQuestion(question(overrides), {
    text,
    mission: DEFAULT_DEMO_MISSION,
    sites: DEMO_SITES,
    time: TIME,
    range: RANGE,
    now,
  });
}

/** A site's sky over a span, the way the Sites list works it out. */
function skyOver(siteIndex: number, span: TimeRange) {
  const site = DEMO_SITES[siteIndex];
  if (!site) throw new Error('no such demo site');
  const sky = siteSky(
    hourlySky(sampledSpan(span)),
    site,
    DEFAULT_DEMO_MISSION,
    span,
    terrainProfileFor(site.id),
  );
  return { site, sky };
}

describe('answerQuestion: past months (2026-11-13)', () => {
  it('answers for months that have ended, and says so', () => {
    const result = answer('Best time in March 2025?', { from: { month: 'March', year: 2025 } });
    expect(result.errors).toEqual([]);
    expect(result.span).toEqual({ start: Date.UTC(2025, 2, 1), end: Date.UTC(2025, 3, 1) });
    expect(result.past).toBe('past');
  });

  it('says "partly" when the span has begun but not ended, and nothing for the future', () => {
    expect(
      answer('Best time from October 2026 to December 2026?', {
        from: { month: 'October', year: 2026 },
        to: { month: 'December', year: 2026 },
      }).past,
    ).toBe('partly');
    expect(answer('Best time in March?', { from: { month: 'March', year: null } }).past).toBeNull();
  });
});

describe('answerQuestion: the three more questions (2026-11-13)', () => {
  it('"how many days of sunlight at X": that site\'s sky over the time bar\'s range', () => {
    const { site, sky } = skyOver(1, RANGE);
    const result = answer(`How many days of sunlight at ${site.name}?`, {
      about: 'sunlight',
      siteName: site.name,
    });
    expect(result.errors).toEqual([]);
    expect(result.span).toEqual(RANGE);
    expect(result.site).toBe(site);
    expect(result.sky?.longestSunlitDays).toBe(sky.longestSunlitDays);
    expect(result.sky?.sunPct).toBe(sky.sunPct);
  });

  it('asks for a site when the sunlight or pass question names none, or a site that is not a demo site', () => {
    const none = answer('How many days of sunlight?', { about: 'sunlight' });
    expect(none.errors).toEqual([
      `Name one of the demo sites in your question, like “${DEMO_SITES[0]?.name ?? ''}”.`,
    ]);
    expect(none.span).toBeNull();
    const unknown = answer('Does Shackleton pass?', { about: 'passes', siteName: 'Shackleton' });
    expect(unknown.dropped).toEqual(["“Shackleton” isn't a demo site."]);
    expect(unknown.errors).toHaveLength(1);
  });

  it('"which site has the most Earth time": the largest Earth share, ties by name', () => {
    const result = answer('Which site has the most Earth time?', { about: 'earth' });
    const shares = DEMO_SITES.map((_, index) => skyOver(index, RANGE));
    const top = [...shares].sort(
      (a, b) => b.sky.earthPct - a.sky.earthPct || a.site.name.localeCompare(b.site.name),
    )[0];
    expect(result.site).toBe(top?.site);
    expect(result.sky?.earthPct).toBe(top?.sky.earthPct);
    expect(result.siteNamed).toBe(false);
    // A named site is noted and not used: this question compares every site.
    expect(
      answer('Does Demo Site Alpha have the most Earth time?', {
        about: 'earth',
        siteName: 'Demo Site Alpha',
      }).dropped,
    ).toEqual(['A site name is not used for this question: it compares every site.']);
  });

  it('"does X pass for Mission Y": the same checks as the Sites list, for that mission', () => {
    const { site, sky } = skyOver(6, RANGE);
    const result = answer(`Does ${site.name} pass?`, { about: 'passes', siteName: site.name });
    const expected = assessSky(sky, DEFAULT_DEMO_MISSION, RANGE);
    expect(result.assessment?.suitable).toBe(expected.suitable);
    expect(result.assessment?.failTitles).toEqual(expected.failTitles);
  });
});

/** The Sites list's own answer over a span, to compare with. */
function bestOver(span: TimeRange) {
  const samples = hourlySky(sampledSpan(span));
  const sky = new Map(
    DEMO_SITES.map((site) => [
      site.id,
      siteSky(samples, site, DEFAULT_DEMO_MISSION, span, terrainProfileFor(site.id)),
    ]),
  );
  return bestDemoSite(rankDemoSites(DEMO_SITES, DEFAULT_DEMO_MISSION, sky, span));
}

describe('answerQuestion: the months', () => {
  it('reads "between October and November" as the next October to the November after it', () => {
    const result = answer('What is the best date between Oct and November?', {
      from: { month: 'October', year: null },
      to: { month: 'November', year: null },
    });
    // October 2026 is over on 15 Nov 2026, so the next October is 2027.
    expect(result.span).toEqual({ start: Date.UTC(2027, 9, 1), end: Date.UTC(2027, 11, 1) });
    expect(result.spanText).toBe('1 Oct to 30 Nov 2027');
    expect(result.spanHow).toBe('no year in your text, so the next October and November were used');
    expect(result.errors).toEqual([]);
  });

  it('counts the current month as the next one', () => {
    const result = answer('When is the best time to land in November?', {
      from: { month: 'November', year: null },
    });
    expect(result.span).toEqual({ start: Date.UTC(2026, 10, 1), end: Date.UTC(2026, 11, 1) });
  });

  it('runs a span over the new year', () => {
    const result = answer('Best time between December and February?', {
      from: { month: 'December', year: null },
      to: { month: 'February', year: null },
    });
    expect(result.span).toEqual({ start: Date.UTC(2026, 11, 1), end: Date.UTC(2027, 2, 1) });
    expect(result.spanText).toBe('1 Dec 2026 to 28 Feb 2027');
  });

  it('uses a typed year, and only a typed one', () => {
    expect(
      answer('Best time in March 2028?', { from: { month: 'March', year: 2028 } }).span,
    ).toEqual({ start: Date.UTC(2028, 2, 1), end: Date.UTC(2028, 3, 1) });

    const guessed = answer('Best time in March?', { from: { month: 'March', year: 2028 } });
    expect(guessed.span?.start).toBe(Date.UTC(2027, 2, 1));
    expect(guessed.dropped).toEqual([
      "The first year isn't in your text, so the next March was used.",
    ]);
  });

  it('drops a month that is not in the text', () => {
    const result = answer('When should we land?', { from: { month: 'March', year: null } });
    expect(result.dropped).toEqual(["The first month isn't in your text, so it was not used."]);
    // No month left: "when" looks over the next ranges, like Other dates.
    expect(result.span).toEqual({
      start: RANGE.start,
      end: RANGE.start + QUESTION_RANGES_AHEAD * RANGE_MS,
    });
  });

  it('answers "where" without months for the time bar\'s range', () => {
    const result = answer('Which site is best this month?', { about: 'where' });
    expect(result.span).toEqual(RANGE);
    expect(result.spanHow).toBe('the time bar’s range');
  });

  it('refuses a span that runs backwards or is too long', () => {
    expect(
      answer('Best time from March 2028 to January 2028?', {
        from: { month: 'March', year: 2028 },
        to: { month: 'January', year: 2028 },
      }).errors,
    ).toEqual(['The last month comes before the first one.']);
    expect(
      answer('Best time from January 2027 to March 2028?', {
        from: { month: 'January', year: 2027 },
        to: { month: 'March', year: 2028 },
      }).errors,
    ).toEqual(['Ask about 12 months at most.']);
  });

  it("refuses months outside the app's years", () => {
    const result = answer('Best time in March 2150?', { from: { month: 'March', year: 2150 } });
    expect(result.errors).toEqual(['Those months are outside what the app covers, 1990 to 2100.']);
    expect(result.span).toBeNull();
  });
});

describe('answerQuestion: the site', () => {
  it('names the same best site and window as the Sites list over those months', () => {
    const result = answer('Which site is best in March?', {
      about: 'where',
      from: { month: 'March', year: null },
    });
    const span = { start: Date.UTC(2027, 2, 1), end: Date.UTC(2027, 3, 1) };
    const best = bestOver(span);
    expect(result.span).toEqual(span);
    expect(result.siteNamed).toBe(false);
    expect(result.site?.id).toBe(best?.site.id);
    expect(result.assessment?.bestWindow).toEqual(best?.assessment.bestWindow);
    expect(result.siteCount).toBe(DEMO_SITES.length);
  });

  it('answers for a site named in the text, with its own checks', () => {
    const site = DEMO_SITES[1];
    if (!site) throw new Error('needs two demo sites');
    const result = answer(`When is the best time to land at ${site.name} in March?`, {
      siteName: site.name.toLowerCase(),
      from: { month: 'March', year: null },
    });
    const span = { start: Date.UTC(2027, 2, 1), end: Date.UTC(2027, 3, 1) };
    const own = assessSky(
      siteSky(
        hourlySky(sampledSpan(span)),
        site,
        DEFAULT_DEMO_MISSION,
        span,
        terrainProfileFor(site.id),
      ),
      DEFAULT_DEMO_MISSION,
      span,
    );
    expect(result.site).toBe(site);
    expect(result.siteNamed).toBe(true);
    expect(result.assessment?.bestWindow).toEqual(own.bestWindow);
    expect(result.assessment?.suitable).toBe(own.suitable);
  });

  it('checks every site when the name is not in the text or not a demo site', () => {
    expect(answer('When should we land?', { siteName: 'Demo Site Alpha' }).dropped).toEqual([
      "A site name that isn't in your text was not used, so every site was checked.",
    ]);

    const result = answer('When should we land at Shackleton?', { siteName: 'Shackleton' });
    expect(result.siteNamed).toBe(false);
    expect(result.dropped).toEqual(["“Shackleton” isn't a demo site, so every site was checked."]);
  });

  it('matches site names like mission names', () => {
    const site = DEMO_SITES[0];
    if (!site) throw new Error('needs a demo site');
    const short = site.name.replace(/^Demo /, '');
    expect(findSiteByName(DEMO_SITES, `  ${short.toUpperCase()} `)).toBe(site);
    expect(findSiteByName(DEMO_SITES, 'Nowhere')).toBeUndefined();
  });
});
