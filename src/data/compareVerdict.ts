/**
 * "Which one?" for the compare panel: one or two plain sentences naming the site with the longer
 * usable window, and which sees the Earth more, built only from the checks the app already made.
 * It computes nothing of its own. Sites and thresholds are DEMO.
 */
import { formatDays, formatShare, type RankedDemoSite } from './demoData';

/** Two windows within this many days count as level. */
const LEVEL_DAYS = 0.5;
/** Two Earth shares within this many points count as level. */
const LEVEL_PCT = 3;

function name(entry: RankedDemoSite): string {
  return entry.site.name;
}

/** Why each unsuitable site cannot be recommended: its first failed check, in plain words. */
function unsuitableNote(entries: readonly RankedDemoSite[]): string {
  return entries
    .map((entry) => {
      const reason = entry.assessment.failTitles[0] ?? 'it fails a check';
      return `${name(entry)} is not suitable: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}.`;
    })
    .join(' ');
}

/** The verdict for 2–4 compared sites, or null with fewer than two. */
export function compareVerdict(entries: readonly RankedDemoSite[]): string | null {
  if (entries.length < 2) return null;
  const suitable = entries
    .filter((entry) => entry.assessment.suitable)
    .sort((a, b) => b.assessment.usableDays - a.assessment.usableDays);
  const why = unsuitableNote(entries.filter((entry) => !entry.assessment.suitable));
  const join = (...parts: string[]) => parts.filter(Boolean).join(' ');

  const [leader, runner] = suitable;
  if (!leader) return join('None of these suits the mission in this month.', why);
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
      ? `${name(mostEarth)} sees the Earth most (${formatShare(mostEarth.assessment.sky.earthPct)} of the month vs ${formatShare(nextEarth.assessment.sky.earthPct)}).`
      : '';
  return join(window, earth, why);
}
