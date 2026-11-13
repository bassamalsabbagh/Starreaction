import type { TourStep } from './tourSteps';

/** What each demo step does to the app; App.tsx carries it out with its existing setters. */
export type DemoAction =
  | 'wholeMoon'
  | 'missionA'
  | 'ranked'
  | 'bestSite'
  | 'playTime'
  | 'otherDates'
  | 'polarSite'
  | 'anywhere'
  | 'compare';

export interface DemoStep extends TourStep {
  action: DemoAction;
  title: string;
}

/** Reading time: each step stays up 0.4 s a word, and never less than 6 s. */
export const STEP_MIN_MS = 6_000;
export const STEP_MS_PER_WORD = 400;

/** How long a step shows while the demo plays, from the words on it. */
export function stepDurationMs(step: Pick<TourStep, 'title' | 'text'>): number {
  const words = `${step.title ?? ''} ${step.text}`.split(/\s+/).filter(Boolean).length;
  return Math.max(STEP_MIN_MS, words * STEP_MS_PER_WORD);
}

/**
 * "Watch demo": nine short captions that drive the app through the planner's question. Every site
 * and mission in it is DEMO; only the Sun and Earth are real.
 */
export const DEMO_STEPS: readonly DemoStep[] = [
  {
    action: 'wholeMoon',
    title: 'The question',
    target: null,
    panel: null,
    text: 'The launch slipped. At our site, on the new date: will we have sunlight for power, and the Earth in view to talk home?',
  },
  {
    action: 'missionA',
    title: 'The mission',
    target: 'mission-needs',
    panel: 'mission',
    text: 'Demo Mission A needs the Sun 5° up for its panels, 3 days of power, and the Earth in view.',
  },
  {
    action: 'ranked',
    title: 'The sites',
    target: 'best',
    panel: 'sites',
    text: 'Every site is checked with the real Sun and Earth. The best one has the longest usable window this month.',
  },
  {
    action: 'bestSite',
    title: 'The horizon',
    target: 'horizon',
    panel: 'site',
    text: 'Its card shows the Sun and Earth now, how long until each sets, and their paths over the horizon this month.',
  },
  {
    action: 'playTime',
    title: 'Move the time',
    target: 'timebar',
    panel: null,
    text: 'Move the time: sunlight sweeps across the Moon, and the countdowns run.',
  },
  {
    action: 'otherDates',
    title: 'If it slips again',
    target: 'other-dates',
    panel: 'site',
    text: 'Slipped again? Other dates lists the best window at the same site for each of the next six months.',
  },
  {
    action: 'polarSite',
    title: 'The south pole',
    target: 'horizon',
    panel: 'site',
    text: 'Near the south pole the Sun skims the horizon and the Earth comes and goes, so small changes in place or date matter.',
  },
  {
    action: 'anywhere',
    title: 'Anywhere on the Moon',
    target: 'details',
    panel: 'point',
    text: 'Click anywhere, or type coordinates: any spot gets the same check from the real Sun and Earth.',
  },
  {
    action: 'compare',
    title: 'Compare sites',
    target: 'compare-verdict',
    panel: null,
    text: 'Compare sites side by side: power, comms and the best window. Now try your own mission.',
  },
];
