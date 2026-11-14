/**
 * "Which one?" for the compare panel: one or two plain sentences naming the site with the longer
 * usable window, and which sees the Earth more, built only from the checks the app already made.
 * It computes nothing of its own. The sites are real; the mission thresholds are DEMO.
 */
import { rangeWords, RANGE_MS, type TimeRange } from '../utils/time';
import { formatDays, formatShare, type CompareEntry } from './demoData';

/** Two windows within this many days count as level. */
const LEVEL_DAYS = 0.5;
/** Two Earth shares within this many points count as level. */
const LEVEL_PCT = 3;

function name(entry: CompareEntry): string {
  return entry.site.name;
}

/** Why each unsuitable site cannot be recommended: its first failed check, in plain words. */
function unsuitableNote(entries: readonly CompareEntry[]): string {
  return entries
    .map((entry) => {
      const reason = entry.assessment.failTitles[0] ?? 'it fails a check';
      return `${name(entry)} is not suitable: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}.`;
    })
    .join(' ');
}

/**
 * The verdict for 2–4 compared sites, or null with fewer than two. `range` is the checked range
 * (the time bar's 29.5 days by default), for its wording only.
 */
export function compareVerdict(
  entries: readonly CompareEntry[],
  range: TimeRange = { start: 0, end: RANGE_MS },
): string | null {
  if (entries.length < 2) return null;
  const words = rangeWords(range);
  const suitable = entries
    .filter((entry) => entry.assessment.suitable)
    .sort((a, b) => b.assessment.usableDays - a.assessment.usableDays);
  const why = unsuitableNote(entries.filter((entry) => !entry.assessment.suitable));
  const join = (...parts: string[]) => parts.filter(Boolean).join(' ');

  const [leader, runner] = suitable;
  if (!leader) return join(`None of these suits the mission ${words.within}.`, why);
  if (!runner) return join(`${name(leader)} is the only one that suits the mission.`, why);

  const lead = leader.assessment.usableDays;
  const trail = runner.assessment.usableDays;
  const window =
    lead - trail >= LEVEL_DAYS
      ? `${name(leader)} has the longest usable window: ${formatDays(lead)} vs ${formatDays(trail)} at ${name(runner)}.`
      : `${name(leader)} and ${name(runner)} have about the same usable window (${formatDays(lead)} and ${formatDays(trail)}).`;
  const byEarth = [...suitable].sort(
    (a, b) => b.assessment.sky.earthPct - a.assessment.sky.earthPct,
  );
  const [mostEarth, nextEarth] = byEarth;
  const earth =
    mostEarth &&
    nextEarth &&
    mostEarth.assessment.sky.earthPct - nextEarth.assessment.sky.earthPct >= LEVEL_PCT
      ? `${name(mostEarth)} sees the Earth most (${formatShare(mostEarth.assessment.sky.earthPct)} ${words.of} vs ${formatShare(nextEarth.assessment.sky.earthPct)}).`
      : '';
  return join(window, earth, why);
}

/** The one line above the Compare cards, as parts: the bold ones are the key facts. */
export interface CompareLine {
  readonly parts: readonly { readonly text: string; readonly bold: boolean }[];
}

/**
 * "Best: **84.4° S, 62.4° E**: **12.9 days** Sun + Earth together vs **11.6 days**." The winner is
 * the suitable place with the most days of the measure the cards show (Sun + Earth together, or
 * the Sun alone with a relay), ties by name; the numbers are the cards' own. Null with fewer than
 * two places.
 */
export function compareLine(
  entries: readonly CompareEntry[],
  hasRelay: boolean,
): CompareLine | null {
  if (entries.length < 2) return null;
  const days = (entry: CompareEntry) =>
    (hasRelay ? entry.assessment.sky.sunHours : entry.assessment.sky.bothHours) / 24;
  const measure = hasRelay ? 'Sun up' : 'Sun + Earth together';
  const suitable = entries
    .filter((entry) => entry.assessment.suitable)
    .sort((a, b) => days(b) - days(a) || name(a).localeCompare(name(b)));
  const [leader, runner] = suitable;
  const part = (text: string, bold = false) => ({ text, bold });
  if (!leader) return { parts: [part('None of these passes for the mission.')] };
  if (!runner) {
    return {
      parts: [part('Best: '), part(name(leader), true), part(': the only one that passes.')],
    };
  }
  return {
    parts: [
      part('Best: '),
      part(name(leader), true),
      part(': '),
      part(`${days(leader).toFixed(1)} days`, true),
      part(` ${measure} vs `),
      part(`${days(runner).toFixed(1)} days`, true),
      part('.'),
    ],
  };
}
