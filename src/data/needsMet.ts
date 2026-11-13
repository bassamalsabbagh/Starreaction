/**
 * "% of mission needs met" (docs/LANDER_RULES.md): the usable window inside the checked month ÷ the
 * days of power the mission needs, capped at 100%. Real units only, no weights. Pure.
 */
import type { DemoMission, SkyAssessment } from './demoData';
import { tenthsOfDayDown } from '../utils/time';

export interface NeedsMet {
  /** 0–100, rounded down, so a near miss never reads as met. */
  readonly pct: number;
  readonly met: boolean;
  /** The usable window inside the month, days (what the checks use). */
  readonly usableDays: number;
  /** Usable ÷ needed, rounded down to one decimal ("6.5×"); null when nothing is needed. */
  readonly times: number | null;
  /** Days still missing, rounded up to one decimal so a shortfall never reads as none. */
  readonly missingDays: number;
  /** The best window is open-ended (a long polar day): every number is only a lower bound. */
  readonly atLeast: boolean;
}

export function needsMet(assessment: SkyAssessment, mission: DemoMission): NeedsMet {
  const needed = mission.daysNeeded;
  const usableDays = assessment.usableDays;
  const window = assessment.bestWindow;
  const atLeast = Boolean(window && (window.openStart || window.openEnd));
  if (needed <= 0) {
    return { pct: 100, met: true, usableDays, times: null, missingDays: 0, atLeast };
  }
  const ratio = usableDays / needed;
  const met = usableDays >= needed;
  return {
    pct: met ? 100 : Math.min(99, Math.floor(ratio * 100 + 1e-9)),
    met,
    usableDays,
    times: tenthsOfDayDown(ratio),
    missingDays: met ? 0 : Math.ceil((needed - usableDays) * 10 - 1e-9) / 10,
    atLeast,
  };
}

/**
 * Below 100%: "62% of needs met · 1.2 d short of 3 d". At 100%: "13.1 d, 6.5× what it needs". An
 * open-ended window puts "at least" before each number.
 */
export function formatNeedsMet(result: NeedsMet, mission: DemoMission): string {
  const atLeast = result.atLeast ? 'at least ' : '';
  if (!result.met) {
    return `${atLeast}${result.pct}% of needs met · ${result.missingDays} d short of ${mission.daysNeeded} d`;
  }
  const days = `${atLeast}${tenthsOfDayDown(result.usableDays)} d`;
  return result.times === null
    ? `${days}; it needs no days of power`
    : `${days}, ${atLeast}${result.times}× what it needs`;
}

/** The short form for a Sites list row: "6.5× what it needs" or "62% of needs met". */
export function formatNeedsMetShort(result: NeedsMet): string {
  const atLeast = result.atLeast ? 'at least ' : '';
  if (!result.met) return `${atLeast}${result.pct}% of needs met`;
  return result.times === null
    ? 'needs no days of power'
    : `${atLeast}${result.times}× what it needs`;
}
