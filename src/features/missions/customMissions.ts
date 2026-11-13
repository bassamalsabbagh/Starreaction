/**
 * "Add your own mission": the editable needs, their DEMO ranges, validation, unique names and
 * saved presets. A custom mission sets exactly what the checks read: the lowest Sun height that
 * still powers its panels, the lowest Earth height for direct contact, the days of power it needs,
 * and whether it has a relay. The sites are the real landings. Pure, apart from the two guarded
 * storage calls.
 */
import type { DemoMission } from '../../data/demoData';

export const CUSTOM_MISSIONS_KEY = 'starreaction.missions.v1';
export const MISSION_NAME_MAX = 30;

export type MissionField = 'minSunElevationDeg' | 'minEarthElevationDeg' | 'daysNeeded';

/** The DEMO ranges the sliders cover. Made up for practice, labelled DEMO in the form. */
export const MISSION_RANGES: Readonly<
  Record<MissionField, { label: string; min: number; max: number; step: number; unit: string }>
> = {
  minSunElevationDeg: {
    label: 'Lowest Sun height for power',
    min: 0,
    max: 20,
    step: 0.5,
    unit: '°',
  },
  minEarthElevationDeg: {
    label: 'Lowest Earth height for contact',
    min: 0,
    max: 20,
    step: 0.5,
    unit: '°',
  },
  daysNeeded: { label: 'Days of power needed', min: 0.5, max: 14, step: 0.5, unit: 'days' },
};

export const MISSION_FIELDS: readonly MissionField[] = [
  'minSunElevationDeg',
  'minEarthElevationDeg',
  'daysNeeded',
];

/** The form as typed: numbers stay text until they are checked, so a half-typed "-" is fine. */
export interface MissionDraft {
  name: string;
  values: Record<MissionField, string>;
  hasRelay: boolean;
}

export type DraftErrors = Partial<Record<MissionField | 'name', string>>;

/** A draft pre-filled from a mission (the name is left as given). */
export function draftFrom(mission: DemoMission, name = ''): MissionDraft {
  return {
    name,
    values: {
      minSunElevationDeg: String(mission.minSunElevationDeg),
      minEarthElevationDeg: String(mission.minEarthElevationDeg),
      daysNeeded: String(mission.daysNeeded),
    },
    hasRelay: mission.hasRelay,
  };
}

function parse(text: string): number | null {
  if (text.trim() === '') return null;
  const value = Number(text.replace('−', '-'));
  return Number.isFinite(value) ? value : null;
}

/** "−5", with a true minus sign, for messages. */
function signed(value: number): string {
  return `${value < 0 ? '−' : ''}${Math.abs(value)}`;
}

/** "0 to 20°" or "0.5 to 14 days": a degree sign sits on its number, a word does not. */
export function rangeText(field: MissionField): string {
  const { min, max, unit } = MISSION_RANGES[field];
  return `${signed(min)} to ${signed(max)}${unit === '°' ? '°' : ` ${unit}`}`;
}

/**
 * Every problem with a draft, by field: a missing name, no days of power, or anything outside the
 * DEMO ranges. Empty when the draft can be used.
 */
export function validateDraft(draft: MissionDraft): DraftErrors {
  const errors: DraftErrors = {};
  const name = draft.name.trim();
  if (name === '') errors.name = 'Give it a name.';
  else if (name.length > MISSION_NAME_MAX) errors.name = `${MISSION_NAME_MAX} characters at most.`;

  for (const field of MISSION_FIELDS) {
    const value = parse(draft.values[field]);
    const range = MISSION_RANGES[field];
    if (value === null) {
      errors[field] = 'Enter a number.';
    } else if (field === 'daysNeeded' && value <= 0) {
      errors[field] = 'It needs some power: above 0 days.';
    } else if (value < range.min || value > range.max) {
      errors[field] = `Outside the DEMO range, ${rangeText(field)}.`;
    }
  }
  return errors;
}

/** The name, or the name with the next free number ("My mission (2)") if it is taken. */
export function uniqueName(name: string, taken: readonly string[]): string {
  const base = name.trim();
  const used = new Set(taken.map((item) => item.toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let n = 2; ; n += 1) {
    const suffix = ` (${n})`;
    const candidate = `${base.slice(0, MISSION_NAME_MAX - suffix.length).trimEnd()}${suffix}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

let idCount = 0;

/** A new id for a custom mission; never one of the built-in ids. */
export function newCustomId(): string {
  idCount += 1;
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `custom-${random}-${idCount}`;
}

/** A mission from a valid draft. */
export function missionFromDraft(draft: MissionDraft, id: string, name: string): DemoMission {
  const number = (field: MissionField) => parse(draft.values[field]) ?? 0;
  return {
    id,
    name,
    custom: true,
    minSunElevationDeg: number('minSunElevationDeg'),
    minEarthElevationDeg: number('minEarthElevationDeg'),
    daysNeeded: number('daysNeeded'),
    hasRelay: draft.hasRelay,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A stored mission, checked field by field; anything malformed is dropped, never trusted. */
function readMission(value: unknown): DemoMission | null {
  if (!isRecord(value)) return null;
  const { id, name, hasRelay } = value;
  if (typeof id !== 'string' || !id.startsWith('custom-')) return null;
  if (typeof name !== 'string' || name.trim() === '' || typeof hasRelay !== 'boolean') return null;
  const read: Partial<Record<MissionField, number>> = {};
  for (const key of MISSION_FIELDS) {
    const field = value[key];
    if (typeof field !== 'number' || !Number.isFinite(field)) return null;
    read[key] = field;
  }
  const mission: DemoMission = {
    id,
    name: name.slice(0, MISSION_NAME_MAX),
    custom: true,
    hasRelay,
    minSunElevationDeg: read.minSunElevationDeg ?? 0,
    minEarthElevationDeg: read.minEarthElevationDeg ?? 0,
    daysNeeded: read.daysNeeded ?? 0,
  };
  // The same rules as the form: a stored impossible mission is dropped.
  return Object.keys(validateDraft(draftFrom(mission, mission.name))).length === 0 ? mission : null;
}

/** Saved presets, or none if storage is missing, blocked or holds something unreadable. */
export function loadCustomMissions(): DemoMission[] {
  try {
    const raw = window.localStorage.getItem(CUSTOM_MISSIONS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(readMission).filter((item): item is DemoMission => item !== null);
  } catch {
    return [];
  }
}

/** Stores the presets; false when storage is unavailable (they then last for this visit only). */
export function saveCustomMissions(missions: readonly DemoMission[]): boolean {
  try {
    window.localStorage.setItem(CUSTOM_MISSIONS_KEY, JSON.stringify(missions));
    return true;
  } catch {
    return false;
  }
}
