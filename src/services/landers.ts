/**
 * Lander facts from Miral's data/landers.json (docs/LANDER_RULES.md, "Lander night survival"), and
 * whether a lander's battery outlasts the longest darkness. Every value keeps its tag, source and
 * note; a null value means not published, never zero. The file is optional: without it `LANDERS`
 * is empty and every lander value is "Unavailable". Pure apart from the file read.
 *
 * The file is a list of landers: `{ id, name, solarPowerW, batteryWh, heaterW, panelAreaM2,
 * touchdownSlopeDeg }`, each value `{ value, tag, source, note? }`.
 */
import { BATTERY_WH_PER_KG } from '../data/powerCheck';
import type { DataStatus } from './sites';

export const LANDER_FIELDS = [
  'solarPowerW',
  'batteryWh',
  'heaterW',
  'panelAreaM2',
  'touchdownSlopeDeg',
] as const;
export type LanderFieldName = (typeof LANDER_FIELDS)[number];

/**
 * How the app names each value. `heaterW` is the whole night load (heater plus electronics), so it
 * is never called "Heater".
 */
export const LANDER_FIELD_LABEL: Readonly<Record<LanderFieldName, string>> = {
  solarPowerW: 'Solar power',
  batteryWh: 'Battery',
  heaterW: 'Night load (heater + electronics)',
  panelAreaM2: 'Panel area',
  touchdownSlopeDeg: 'Touchdown slope (spec)',
};

export const LANDER_FIELD_UNIT: Readonly<Record<LanderFieldName, string>> = {
  solarPowerW: 'W',
  batteryWh: 'Wh',
  heaterW: 'W',
  panelAreaM2: 'm²',
  touchdownSlopeDeg: '°',
};

/**
 * Miral's tags: S opened source, S* seen on a secondary page, D derived, A assumption, and "not
 * published" for a value no source gives.
 */
export const LANDER_TAGS = ['S', 'S*', 'D', 'A', 'not published'] as const;
export type LanderTag = (typeof LANDER_TAGS)[number];

export interface LanderValue {
  /** Null: not published. */
  readonly value: number | null;
  readonly tag: LanderTag;
  /** A URL, or null. */
  readonly source: string | null;
  readonly note: string | null;
}

export interface Lander {
  readonly id: string;
  readonly name: string;
  readonly fields: Readonly<Record<LanderFieldName, LanderValue>>;
}

export const NOT_PUBLISHED: LanderValue = {
  value: null,
  tag: 'not published',
  source: null,
  note: null,
};

/** The app's data-status word for a lander value. */
export function landerValueStatus(field: LanderValue): DataStatus {
  if (field.value === null) return 'Unavailable';
  if (field.tag === 'D') return 'Calculated';
  if (field.tag === 'A') return 'Assumed';
  return 'Real data';
}

/**
 * Whether the value's note records sources that disagree (shown next to the value): "CONFLICT",
 * "the two conflict", "other pages say …", "secondary pages disagree".
 */
export function mentionsConflict(field: LanderValue): boolean {
  return field.note !== null && /conflict|disagree|other pages say/i.test(field.note);
}

export class LanderDataError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`data/landers.json is not valid:\n- ${problems.join('\n- ')}`);
    this.name = 'LanderDataError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const optionalText = (value: unknown): string | null | undefined =>
  value === null || value === undefined
    ? null
    : typeof value === 'string' && value.trim() !== ''
      ? value
      : undefined;

const LANDER_KEYS: readonly string[] = ['id', 'name', ...LANDER_FIELDS];

/**
 * The landers in a parsed data/landers.json. Every lander has an id, a name and the five values,
 * each `{ value, tag, source, note? }`: a number with a tag S, S*, D or A, or null with the tag
 * "not published". Unknown keys are refused, so a misspelt field never reads as "not published".
 * Throws LanderDataError listing every problem.
 */
export function parseLanders(raw: unknown): readonly Lander[] {
  if (!Array.isArray(raw)) throw new LanderDataError(['expected a list of landers']);
  const problems: string[] = [];
  const landers: Lander[] = [];
  const seen = new Set<string>();
  raw.forEach((entry: unknown, index) => {
    const where = `[${index}]`;
    if (!isRecord(entry)) {
      problems.push(`${where} is not an object`);
      return;
    }
    const before = problems.length;
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    if (!id) problems.push(`${where}.id must be a non-empty string`);
    if (!name) problems.push(`${where}.name must be a non-empty string`);
    if (id && seen.has(id)) problems.push(`${where}.id "${id}" is repeated`);
    seen.add(id);
    for (const key of Object.keys(entry)) {
      if (!LANDER_KEYS.includes(key)) problems.push(`${where}.${key} is not a known field`);
    }
    const fields = {} as Record<LanderFieldName, LanderValue>;
    for (const key of LANDER_FIELDS) {
      const field = entry[key];
      const at = `${where}.${key}`;
      if (!isRecord(field)) {
        problems.push(`${at} must be { value, tag, source, note }`);
        continue;
      }
      const value = field.value ?? null;
      if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) {
        problems.push(`${at}.value must be a number or null`);
      }
      const tag = LANDER_TAGS.find((candidate) => candidate === field.tag);
      if (!tag) {
        problems.push(`${at}.tag must be one of S, S*, D, A, "not published"`);
      } else if (value === null && tag !== 'not published') {
        problems.push(`${at} has no value, so its tag must be "not published"`);
      } else if (value !== null && tag === 'not published') {
        problems.push(`${at} has a value, so its tag can't be "not published"`);
      }
      const source = optionalText(field.source);
      const note = optionalText(field.note);
      if (source === undefined) problems.push(`${at}.source must be text or null`);
      if (note === undefined) problems.push(`${at}.note must be text or null`);
      fields[key] = {
        value: typeof value === 'number' ? value : null,
        tag: tag ?? 'not published',
        source: source ?? null,
        note: note ?? null,
      };
    }
    if (problems.length === before) landers.push({ id, name, fields });
  });
  if (problems.length > 0) throw new LanderDataError(problems);
  return landers;
}

const found = import.meta.glob<unknown>('../../data/landers.json', {
  eager: true,
  import: 'default',
});
const raw = Object.values(found)[0];

/** Whether data/landers.json is in the project. */
export const LANDERS_LOADED = raw !== undefined;

/** Miral's landers, checked; empty without data/landers.json. */
export const LANDERS: readonly Lander[] = LANDERS_LOADED ? parseLanders(raw) : [];

export function findLander(id: string, landers: readonly Lander[] = LANDERS): Lander | undefined {
  return landers.find((lander) => lander.id === id);
}

export type NightSurvival =
  | {
      readonly kind: 'survives' | 'doesnt';
      /** batteryWh ÷ heaterW (the night load). */
      readonly batteryHours: number;
      readonly darkHours: number;
      /** The darkness touches the range's edge, so the real night may be longer. */
      readonly darkAtLeast: boolean;
    }
  | {
      readonly kind: 'cant-judge';
      /**
       * Why: no lander data for the site; a value not published; or the battery outlasts the
       * darkness seen, but that darkness is cut by the range's edge, so the real night is longer.
       */
      readonly cause: 'no-lander' | 'not-published' | 'night-longer';
      /** "Can't judge: not published", "Can't judge: the night runs past the dates checked", … */
      readonly reason: string;
      /** The values that are missing (empty unless the cause is 'not-published'). */
      readonly missing: readonly LanderFieldName[];
      /** For 'night-longer' only: what the battery lasts and the darkness seen (at least). */
      readonly batteryHours?: number;
      readonly darkHours?: number;
    };

/**
 * Whether the battery keeps the night load (heater plus electronics) on through the longest
 * darkness in the range: hours the battery lasts = batteryWh ÷ heaterW. Judged only when both are
 * published (docs/LANDER_RULES.md, "Lander night survival"). When the darkness touches the range's
 * edge it is only a lower bound: a battery shorter than it fails for certain, but one that outlasts
 * it can't be judged, because the real night is longer.
 */
export function nightSurvival(
  lander: Lander | undefined,
  dark: { hours: number; atLeast: boolean },
): NightSurvival {
  if (!lander) {
    return {
      kind: 'cant-judge',
      cause: 'no-lander',
      reason: "Can't judge: lander data not loaded",
      missing: [],
    };
  }
  const battery = lander.fields.batteryWh.value;
  const load = lander.fields.heaterW.value;
  if (battery === null || load === null || load <= 0) {
    const missing = (['batteryWh', 'heaterW'] as const).filter(
      (key) => lander.fields[key].value === null || (key === 'heaterW' && (load ?? 0) <= 0),
    );
    return {
      kind: 'cant-judge',
      cause: 'not-published',
      reason: "Can't judge: not published",
      missing,
    };
  }
  const batteryHours = battery / load;
  if (dark.atLeast && batteryHours >= dark.hours) {
    return {
      kind: 'cant-judge',
      cause: 'night-longer',
      reason: "Can't judge: the night runs past the dates checked",
      missing: [],
      batteryHours,
      darkHours: dark.hours,
    };
  }
  return {
    kind: batteryHours >= dark.hours ? 'survives' : 'doesnt',
    batteryHours,
    darkHours: dark.hours,
    darkAtLeast: dark.atLeast,
  };
}

/** "Battery needed here": night load W × darkness h, in Wh and in kg at 143 Wh/kg. */
export function batteryNeededHere(loadW: number, darkHours: number): { wh: number; kg: number } {
  const wh = loadW * darkHours;
  return { wh, kg: wh / BATTERY_WH_PER_KG };
}
