/**
 * The left panel's four steps (Location, Mission, Dates, Results): which step may be opened and
 * when Next is allowed. Pure, so the rules are tested without the UI.
 */
import type { MissionDraft } from '../missions/customMissions';
import { DAY_MS } from '../../utils/time';

export const WIZARD_STEPS = [
  { id: 'location', label: 'Location', title: 'Choose a location' },
  { id: 'mission', label: 'Lander', title: 'What does your lander need?' },
  { id: 'dates', label: 'Dates', title: 'Pick the dates' },
  { id: 'results', label: 'Results', title: 'Results' },
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number]['id'];

/** What each step needs before Next: a place, a valid mission, valid dates. */
export interface WizardInputs {
  hasLocation: boolean;
  missionValid: boolean;
  datesValid: boolean;
}

/** True when this step's own input is complete (Results has none). */
export function stepComplete(index: number, inputs: WizardInputs): boolean {
  switch (WIZARD_STEPS[index]?.id) {
    case 'location':
      return inputs.hasLocation;
    case 'mission':
      return inputs.missionValid;
    case 'dates':
      return inputs.datesValid;
    case 'results':
      return true;
    default:
      return false;
  }
}

/** A step can be opened when every step before it is complete. */
export function canOpen(index: number, inputs: WizardInputs): boolean {
  if (index < 0 || index >= WIZARD_STEPS.length) return false;
  for (let before = 0; before < index; before += 1) {
    if (!stepComplete(before, inputs)) return false;
  }
  return true;
}

/**
 * The mission form's starting values: neutral input defaults (the horizon, one day), shown as
 * "Starting values: change them to your mission". Not data about any lander.
 */
export const STARTING_DRAFT: MissionDraft = {
  name: '',
  values: { minSunElevationDeg: '0', minEarthElevationDeg: '0', daysNeeded: '1' },
  hasRelay: false,
};

/** Today (00:00 UTC) to 14 days later, the stop date included: the Dates step's default. */
export function defaultDates(now: number): { startMs: number; stopMs: number } {
  const startMs = Math.floor(now / DAY_MS) * DAY_MS;
  return { startMs, stopMs: startMs + 14 * DAY_MS };
}

/** The coordinate box's one hint line (the Location step and Compare). */
export const LOCATION_HINT = 'South and west are negative, e.g. -84.79, 29.20';
