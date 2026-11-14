/**
 * The fixed sentence shown after the assistant's change is applied. It is filled only from the
 * app's own results (the same checks as the Sites list), never written by the AI. Pure.
 */
import { bestSite, formatDays, type DemoMission, type RankedSite } from '../../data/demoData';
import { formatDayMonth, formatWindowRange, type TimeRange } from '../../utils/time';

/**
 * "1 Mar to 30 Mar 2027", or "18 Dec 2026 to 16 Jan 2027" across a new year. The range's end is
 * exclusive, so the last day named is the one the range's last moment falls on (12 to 25 Dec for
 * picked dates ending 00:00 on 26 Dec).
 */
export function rangeText(range: TimeRange): string {
  const last = range.end - 1;
  const startYear = new Date(range.start).getUTCFullYear();
  const endYear = new Date(last).getUTCFullYear();
  const start = formatDayMonth(range.start);
  const end = `${formatDayMonth(last)} ${endYear}`;
  return startYear === endYear ? `${start} to ${end}` : `${start} ${startYear} to ${end}`;
}

/**
 * "From 1 Mar to 30 Mar 2027 (UTC), Blue Ghost Mission 1 has the longest usable window for Demo
 * Mission A: 9.8 days inside this range (best window …). 3 of 4 sites pass all the checks."
 */
export function slipSummary(
  ranked: readonly RankedSite[],
  mission: DemoMission,
  range: TimeRange,
): string {
  const span = `From ${rangeText(range)} (UTC)`;
  const suitable = ranked.filter((entry) => entry.rank !== null);
  const best = bestSite(ranked);
  if (!best) {
    return `${span}, no site passes all the checks for ${mission.name}. A site's Other dates shows the months ahead.`;
  }
  const window = best.assessment.bestWindow;
  const windowText = window ? ` (best window ${formatWindowRange(window)})` : '';
  const count = `${suitable.length} of ${ranked.length} sites ${suitable.length === 1 ? 'passes' : 'pass'} all the checks.`;
  return `${span}, ${best.site.name} has the longest usable window for ${mission.name}: ${formatDays(best.assessment.usableDays)} inside this range${windowText}. ${count}`;
}
