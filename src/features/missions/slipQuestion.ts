/**
 * The app's answer to a question the assistant read ("when is the best time to land in March?",
 * "which site is best?"): docs/LANDER_RULES.md, "Launch slipped" assistant, rule 9. The AI only
 * said what was asked; the months, the site and every number here come from the user's text and
 * the app's own checks (the same `siteSky` and `assessSky` as the Sites list). Pure.
 */
import {
  assessSky,
  bestSite,
  rankSites,
  type DemoMission,
  type SkyAssessment,
} from '../../data/demoData';
import { terrainProfileFor } from '../../data/terrainPatches';
import { siteHourlySky, type HorizonsSeries } from '../../services/horizonsData';
import type { Site } from '../../services/sites';
import {
  SLIP_MONTHS,
  type SlipQuestion,
  type SlipQuestionAbout,
  type SlipQuestionMonth,
} from '../../services/slipReading';
import { sampledSpan, siteSky, type SiteSky } from '../../utils/skyVisibility';
import {
  RANGE_MS,
  TIME_MAX_MS,
  TIME_MIN_MS,
  formatDayMonth,
  type TimeRange,
} from '../../utils/time';
import { appearsIn, inText, monthInText, numbersInText } from './slipPlan';

/** A question without months: "when" looks this many ranges ahead (as Other dates does). */
export const QUESTION_RANGES_AHEAD = 6;
/** The longest span a question may cover, in calendar months. */
export const QUESTION_MONTHS_MAX = 12;

export interface SlipAnswerContext {
  readonly text: string;
  /** The mission to answer for (the one named in the text, or the selected one). */
  readonly mission: DemoMission;
  readonly sites: readonly Site[];
  /** The time bar's time: a month without a year is the next one from here. */
  readonly time: number;
  /** The range being checked: a question without months (except "when") answers for it. */
  readonly range: TimeRange;
  /** How the answer names that range (default "the time bar’s range"). */
  readonly rangeName?: string;
  /** The fixed sites' JPL Horizons positions by site id (the engine where they have no data). */
  readonly series?: ReadonlyMap<string, HorizonsSeries>;
  /** The real clock (UTC ms): months that have ended are "in the past". */
  readonly now: number;
}

export interface SlipAnswer {
  readonly about: SlipQuestionAbout;
  readonly mission: DemoMission;
  /** The span checked, and how it was worked out ("no year in your text, …"), or null on error. */
  readonly span: TimeRange | null;
  readonly spanText: string;
  readonly spanHow: string | null;
  /** "past" when every month asked about has ended, "partly" when some have (real clock). */
  readonly past: 'past' | 'partly' | null;
  /**
   * The site answered for: the one named in the text, the best one ("when"/"where", null when none
   * passes), or the one with the most Earth time ("earth").
   */
  readonly site: Site | null;
  readonly siteNamed: boolean;
  /** That site's Sun and Earth over the span. */
  readonly sky: SiteSky | null;
  readonly assessment: SkyAssessment | null;
  /** How many sites pass all the checks over the span (when no site was named). */
  readonly suitableCount: number;
  readonly siteCount: number;
  /** Parts of the question that were not used, and why (never the AI's values). */
  readonly dropped: readonly string[];
  /** Why the question could not be answered. */
  readonly errors: readonly string[];
}

/**
 * Other names a site goes by in a question, besides its full name and its id (matched the same
 * way: ignoring case, spaces and hyphens).
 */
export const SITE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  im1: ['IM-1', 'Odysseus'],
  im2: ['IM-2', 'Athena'],
  bg1: ['Blue Ghost'],
  ch3: ['Chandrayaan-3', 'Chandrayaan', 'Vikram'],
};

/** "IM-2 Athena", "im 2 athena" and "IM2-Athena" are the same site. */
function siteKey(name: string): string {
  // Hyphens include the typographic ones (U+2010–2015) a pasted name may carry.
  return name.toLowerCase().replace(/[\s\-\u2010-\u2015]+/g, '');
}

/** The site a name means: its full name, its id or one of its aliases. */
export function findSiteByName(sites: readonly Site[], name: string): Site | undefined {
  const wanted = siteKey(name);
  if (wanted === '') return undefined;
  return sites.find((site) =>
    [site.name, site.id, ...(SITE_ALIASES[site.id] ?? [])].some((key) => siteKey(key) === wanted),
  );
}

/** The first day of a month, as a count of months since year 0 (for comparing and adding). */
const monthIndex = (year: number, month: number) => year * 12 + month;
const monthStart = (index: number) => Date.UTC(Math.floor(index / 12), index % 12, 1);

/** "1 Oct to 30 Nov 2027", or "1 Dec 2026 to 31 Jan 2027" across a new year (UTC). */
function spanText(span: TimeRange): string {
  const last = span.end - 1;
  const startYear = new Date(span.start).getUTCFullYear();
  const endYear = new Date(last).getUTCFullYear();
  const start = formatDayMonth(span.start);
  const end = `${formatDayMonth(last)} ${endYear}`;
  return startYear === endYear ? `${start} to ${end}` : `${start} ${startYear} to ${end}`;
}

/**
 * The months asked about, checked against the text: a month must be written, a year is used only
 * when written, and a missing year is the next time that month starts on or after the time bar's
 * month.
 */
function readSpan(
  question: SlipQuestion,
  context: SlipAnswerContext,
  dropped: string[],
  errors: string[],
): { span: TimeRange; how: string | null } | null {
  const { text, time, range } = context;
  const numbers = numbersInText(text);
  const check = (month: SlipQuestionMonth | null, which: string): SlipQuestionMonth | null => {
    if (!month) return null;
    if (!monthInText(month.month, text, numbers)) {
      dropped.push(`The ${which} month isn't in your text, so it was not used.`);
      return null;
    }
    if (month.year !== null && !inText(month.year, numbers)) {
      dropped.push(`The ${which} year isn't in your text, so the next ${month.month} was used.`);
      return { ...month, year: null };
    }
    return month;
  };
  let from = check(question.from, 'first');
  let to = check(question.to, 'last');
  if (!from && to) {
    from = to;
    to = null;
  }

  if (!from) {
    // Only "when" looks ahead; every other question is about the time bar's range, like the list.
    if (question.about !== 'when') {
      return { span: range, how: context.rangeName ?? 'the time bar’s range' };
    }
    return {
      span: { start: range.start, end: range.start + QUESTION_RANGES_AHEAD * RANGE_MS },
      how: `the next ${QUESTION_RANGES_AHEAD} months from the time bar`,
    };
  }

  const now = new Date(time);
  const current = monthIndex(now.getUTCFullYear(), now.getUTCMonth());
  const guessed: string[] = [];
  const startOf = (month: SlipQuestionMonth, notBefore: number): number => {
    const m = SLIP_MONTHS.indexOf(month.month);
    if (month.year !== null) return monthIndex(month.year, m);
    guessed.push(month.month);
    const sameYear = monthIndex(Math.floor(notBefore / 12), m);
    return sameYear >= notBefore ? sameYear : sameYear + 12;
  };
  const first = startOf(from, current);
  const last = to ? startOf(to, first) : first;
  if (last < first) {
    errors.push('The last month comes before the first one.');
    return null;
  }
  if (last - first + 1 > QUESTION_MONTHS_MAX) {
    errors.push(`Ask about ${QUESTION_MONTHS_MAX} months at most.`);
    return null;
  }
  const span = { start: monthStart(first), end: monthStart(last + 1) };
  if (span.start < TIME_MIN_MS || span.end > TIME_MAX_MS) {
    errors.push('Those months are outside what the app covers, 1990 to 2100.');
    return null;
  }
  const how =
    guessed.length > 0
      ? `no year in your text, so the next ${guessed.join(' and ')} ${guessed.length === 1 ? 'was' : 'were'} used`
      : null;
  return { span, how };
}

/** Questions about one site: without a named site they can't be answered. */
const NEEDS_A_SITE: readonly SlipQuestionAbout[] = ['sunlight', 'passes'];

/** Whether the months asked about have ended, by the real clock. */
function pastOf(span: TimeRange, now: number): SlipAnswer['past'] {
  if (span.end <= now) return 'past';
  return span.start < now ? 'partly' : null;
}

/**
 * The app's answer (assistant rule 9): the span, the site (named, the best, or the one with the
 * most Earth time), its sky and its checks.
 */
export function answerQuestion(question: SlipQuestion, context: SlipAnswerContext): SlipAnswer {
  const { text, mission, sites, now } = context;
  const { about } = question;
  const dropped: string[] = [];
  const errors: string[] = [];
  const needsSite = NEEDS_A_SITE.includes(about);
  // When a site can't be used: "when"/"where" check every site instead; the one-site questions
  // can't be answered; the Earth-time question compares every site anyway.
  const notUsed = needsSite ? '' : ', so every site was checked';

  let named: Site | null = null;
  if (question.siteName !== null) {
    if (about === 'earth') {
      dropped.push('A site name is not used for this question: it compares every site.');
    } else if (!appearsIn(question.siteName, text)) {
      dropped.push(`A site name that isn't in your text was not used${notUsed}.`);
    } else {
      const found = findSiteByName(sites, question.siteName);
      if (found) named = found;
      else dropped.push(`“${question.siteName.trim()}” isn't one of our sites${notUsed}.`);
    }
  }
  if (needsSite && !named) {
    const example = sites[0]?.name ?? 'a landing site';
    errors.push(`Name one of the sites in your question, like “${example}”.`);
  }

  const read = errors.length === 0 ? readSpan(question, context, dropped, errors) : null;
  const empty = {
    about,
    mission,
    siteNamed: named !== null,
    siteCount: sites.length,
    dropped,
    errors,
  };
  if (!read) {
    return {
      ...empty,
      span: null,
      spanText: '',
      spanHow: null,
      past: null,
      site: named,
      sky: null,
      assessment: null,
      suitableCount: 0,
    };
  }

  const { span, how } = read;
  const skyOf = (site: Site) =>
    siteSky(
      siteHourlySky(context.series?.get(site.id) ?? null, site, sampledSpan(span)).samples,
      site,
      mission,
      span,
      terrainProfileFor(site.id),
    );
  const answered = {
    ...empty,
    span,
    spanText: spanText(span),
    spanHow: how,
    past: pastOf(span, now),
  };

  if (named) {
    const sky = skyOf(named);
    const assessment = assessSky(sky, mission, span);
    return {
      ...answered,
      site: named,
      sky,
      assessment,
      suitableCount: assessment.suitable ? 1 : 0,
    };
  }

  const skies = new Map(sites.map((site) => [site.id, skyOf(site)]));
  const ranked = rankSites(sites, mission, skies, span);
  const suitableCount = ranked.filter((entry) => entry.rank !== null).length;
  if (about === 'earth') {
    // The most Earth time over the months, ties by name; suitable or not, it is a fact.
    const top = [...sites].sort(
      (a, b) =>
        (skies.get(b.id)?.earthPct ?? 0) - (skies.get(a.id)?.earthPct ?? 0) ||
        a.name.localeCompare(b.name),
    )[0];
    const sky = top ? (skies.get(top.id) ?? null) : null;
    return {
      ...answered,
      site: top ?? null,
      sky,
      assessment: top && sky ? assessSky(sky, mission, span) : null,
      suitableCount,
    };
  }
  const best = bestSite(ranked);
  return {
    ...answered,
    site: best?.site ?? null,
    sky: best ? (skies.get(best.site.id) ?? null) : null,
    assessment: best?.assessment ?? null,
    suitableCount,
  };
}
