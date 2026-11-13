/** The first-run tour: six steps, one or two short sentences each. */
export interface TourStep {
  /** The `data-tour` value of the element to spotlight, or null for none. */
  target: string | null;
  /** Which view the panel must show to see it, or null to leave the panel as it is. */
  panel: 'mission' | 'sites' | 'site' | 'point' | null;
  /** The caption's title line (the demo; the tour card has none). */
  title?: string;
  text: string;
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    target: 'rail',
    panel: null,
    text: 'The menu: Mission, Sites, Compare and Lessons each open in the panel beside it. Click again to close.',
  },
  {
    target: 'mission',
    panel: 'mission',
    text: 'Pick a mission: how high the Sun must be for its panels, how many days of power it needs, and whether it must see the Earth.',
  },
  {
    target: 'sites',
    panel: 'sites',
    text: 'Sites, best first: the longest usable window this month. Type coordinates, or click anywhere on the Moon, to check any spot.',
  },
  {
    target: 'horizon',
    panel: 'site',
    text: 'The horizon view: the Sun’s and Earth’s paths this month, as seen from the site. The dots are where they are now.',
  },
  {
    target: 'status',
    panel: null,
    text: 'The status line: the clock, and how long until sunset and Earthset at the selected place.',
  },
  {
    target: 'timebar',
    panel: null,
    text: 'The timeline: play or step through the month. Teal marks the windows with the Sun up, and the Earth too when the mission needs it.',
  },
];
