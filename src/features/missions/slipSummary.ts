/**
 * The fixed sentence shown after the assistant's change is applied. It is filled only from the
 * app's own results (the same checks as the Sites list), never written by the AI. Pure.
 */
import {
  bestDemoSite,
  formatDays,
  type DemoMission,
  type RankedDemoSite,
} from '../../data/demoData';
import { formatDayMonth, formatWindowRange, type TimeRange } from '../../utils/time';

/** "1 Mar to 30 Mar 2027", or "18 Dec 2026 to 16 Jan 2027" across a new year. */
export function rangeText(range: TimeRange): string {
  const startYear = new Date(range.start).getUTCFullYear();
  const endYear = new Date(range.end).getUTCFullYear();
  const start = formatDayMonth(range.start);
  const end = `${formatDayMonth(range.end)} ${endYear}`;
  return startYear === endYear ? `${start} to ${end}` : `${start} ${startYear} to ${end}`;
}

/**
 * "From 1 Mar to 30 Mar 2027 (UTC), Demo Site Alpha has the longest usable window for Demo Mission
 * A: 9.8 days inside this range (best window …). 6 of 9 demo sites pass all the checks."
 */
export function slipSummary(
  ranked: readonly RankedDemoSite[],
  mission: DemoMission,
  range: TimeRange,
): string {
  const span = `From ${rangeText(range)} (UTC)`;
  const suitable = ranked.filter((entry) => entry.rank !== null);
  const best = bestDemoSite(ranked);
  if (!best) {
    return `${span}, no demo site passes all the checks for ${mission.name}. A site's Other dates shows the months ahead.`;
  }
  const window = best.assessment.bestWindow;
  const windowText = window ? ` (best window ${formatWindowRange(window)})` : '';
  const count = `${suitable.length} of ${ranked.length} demo sites ${suitable.length === 1 ? 'passes' : 'pass'} all the checks.`;
  return `${span}, ${best.site.name} has the longest usable window for ${mission.name}: ${formatDays(best.assessment.usableDays)} inside this range${windowText}. ${count}`;
}
