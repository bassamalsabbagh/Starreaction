/**
 * What the app makes of the assistant's reading (docs/LANDER_RULES.md, "Launch slipped
 * assistant"). The AI only read the text; here the app checks every value against that text,
 * matches the mission name against its own list, checks the needs against the form's DEMO ranges,
 * and works out every date in UTC. Nothing the AI wrote reaches the screen unless it is a word or
 * number from the user's own text. Pure.
 */
import type { DemoMission } from '../../data/demoData';
import { SLIP_MONTHS, type SlipMonth, type SlipReading } from '../../services/slipReading';
import { DAY_MS, TIME_MAX_MS, TIME_MIN_MS, formatClock } from '../../utils/time';
import {
  MISSION_NAME_MAX,
  MISSION_RANGES,
  draftFrom,
  validateDraft,
  type MissionDraft,
  type MissionField,
} from './customMissions';

/** The AI's need fields, in the order the Mission view shows them, with the need each sets. */
const NEED_FIELDS: readonly {
  key: 'minSunDeg' | 'powerDays' | 'minEarthDeg';
  field: MissionField;
}[] = [
  { key: 'minSunDeg', field: 'minSunElevationDeg' },
  { key: 'powerDays', field: 'daysNeeded' },
  { key: 'minEarthDeg', field: 'minEarthElevationDeg' },
];

const WORD_NUMBERS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

/**
 * Every number written in the text: digits (0-9, with a decimal point), English words from one to
 * twenty, and "a"/"an" as 1 only before a unit ("a week", "an extra day" does not count). Nothing
 * else (other scripts, "next", "couple") counts.
 */
export function numbersInText(text: string): number[] {
  const found: number[] = [];
  for (const match of text.matchAll(/\d+(?:\.\d+)?/g)) found.push(Number(match[0]));
  for (const match of text.toLowerCase().matchAll(/\b[a-z]+\b/g)) {
    const value = WORD_NUMBERS[match[0]];
    if (value !== undefined) found.push(value);
  }
  if (/\b(?:a|an)\s+(?:day|week|month|year|degree)s?\b/i.test(text)) found.push(1);
  return found;
}

export function inText(value: number, numbers: readonly number[]): boolean {
  return numbers.some((number) => Math.abs(number - Math.abs(value)) < 1e-9);
}

/** Lower case, one space between words, straight quotes: for "appears in the text" checks. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
}

/** True when the quote appears word for word (ignoring case and spacing) in the text. */
export function appearsIn(quote: string, text: string): boolean {
  const wanted = normalise(quote);
  return wanted !== '' && normalise(text).includes(wanted);
}

/** "Mission B", "demo mission b" and "Demo Mission B" are the same mission. */
function missionKey(name: string): string {
  return normalise(name).replace(/^demo /, '');
}

export function findMissionByName(
  missions: readonly DemoMission[],
  name: string,
): DemoMission | undefined {
  const wanted = missionKey(name);
  return missions.find((mission) => missionKey(mission.name) === wanted);
}

export function monthInText(month: SlipMonth, text: string, numbers: readonly number[]): boolean {
  const index = SLIP_MONTHS.indexOf(month);
  const short = month.slice(0, 3);
  const named = new RegExp(`\\b(?:${month}|${short})\\b`, 'i').test(text);
  return named || numbers.includes(index + 1);
}

/** Whole calendar months later (or earlier), the day kept or moved to the month's last day. */
export function addMonthsUtc(ms: number, months: number): number {
  const date = new Date(ms);
  const total = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(
    year,
    month,
    Math.min(date.getUTCDate(), lastDay),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  );
}

/** Which mission the text is about. */
export type SlipMissionRead =
  | { readonly kind: 'selected'; readonly mission: DemoMission }
  | { readonly kind: 'known'; readonly mission: DemoMission }
  | { readonly kind: 'unknown'; readonly name: string };

/** The new time, and how it was worked out ("3 weeks later than …"). */
export interface SlipTime {
  readonly from: number;
  readonly to: number;
  readonly how: string;
}

/** One need in the read-back: before, after, and whether the text mentioned it. */
export interface SlipNeedLine {
  readonly field: MissionField | 'hasRelay';
  readonly label: string;
  readonly before: string | null;
  readonly after: string;
  readonly mentioned: boolean;
  readonly changed: boolean;
}

export interface SlipPlan {
  readonly mission: SlipMissionRead;
  readonly time: SlipTime | null;
  /** The form's values with what was read (an unknown mission: only what was read). */
  readonly draft: MissionDraft;
  readonly needs: readonly SlipNeedLine[];
  /** A need differs from the mission's own. */
  readonly changed: boolean;
  /** Problems that keep Apply off (out of range, impossible dates). */
  readonly errors: readonly string[];
  /** Values the AI gave that were not used, and why (never the values themselves). */
  readonly dropped: readonly string[];
  /** The text the AI could not read, quoted word for word. */
  readonly unclear: readonly string[];
  /** "Unclear" notes that were not word-for-word quotes, so not shown. */
  readonly unclearHidden: number;
  /** Nothing at all was read. */
  readonly empty: boolean;
  /** Some setting was read (a mission, a date, a need); false when only quotes or a question. */
  readonly readAny: boolean;
  /** Apply would change something, and nothing blocks it. */
  readonly canApply: boolean;
}

export interface SlipContext {
  readonly text: string;
  readonly missions: readonly DemoMission[];
  readonly selected: DemoMission;
  /** The time bar's time: a shift counts from here, and a date without a year after it. */
  readonly time: number;
}

function needText(field: MissionField, value: number | string): string {
  return field === 'daysNeeded' ? `${value} days` : `${value}°`;
}

function plural(amount: number, unit: string): string {
  const one = unit.replace(/s$/, '');
  return `${amount} ${amount === 1 ? one : unit}`;
}

const OUT_OF_TIME = 'That date is outside what the app covers, 1 Jan 1990 to 31 Dec 2100.';

/** The time from the reading, or why it could not be worked out. */
function readTime(
  reading: SlipReading,
  text: string,
  numbers: readonly number[],
  from: number,
  dropped: string[],
  errors: string[],
): SlipTime | null {
  let shift = reading.shift;
  if (shift && !inText(shift.shift, numbers)) {
    dropped.push("The shift's amount isn't in your text, so it was not used.");
    shift = null;
  } else if (shift && !new RegExp(`\\b${shift.unit.replace(/s$/, '')}s?\\b`, 'i').test(text)) {
    dropped.push(`The shift's unit (${shift.unit}) isn't in your text, so it was not used.`);
    shift = null;
  }

  let date = reading.date;
  if (date && !monthInText(date.month, text, numbers)) {
    dropped.push("The date's month isn't in your text, so the date was not used.");
    date = null;
  }
  if (date && date.day !== null && !inText(date.day, numbers)) {
    dropped.push("The date's day isn't in your text, so only its month was used.");
    date = { ...date, day: null };
  }
  if (date && date.year !== null && !inText(date.year, numbers)) {
    dropped.push("The date's year isn't in your text, so the next one was used.");
    date = { ...date, year: null };
  }

  if (shift && date) {
    errors.push('Your text gives both a shift and a date. Pick one, or set the date in the form.');
    return null;
  }

  if (shift) {
    const amount = Math.abs(shift.shift);
    const way = shift.shift < 0 ? 'earlier' : 'later';
    const months =
      shift.unit === 'months' ? shift.shift : shift.unit === 'years' ? shift.shift * 12 : null;
    if (months !== null && !Number.isInteger(shift.shift)) {
      errors.push(
        `A shift of ${plural(amount, shift.unit)} can't be put on a calendar. Use days or weeks, or set the date in the form.`,
      );
      return null;
    }
    const to =
      months !== null
        ? addMonthsUtc(from, months)
        : from + shift.shift * DAY_MS * (shift.unit === 'weeks' ? 7 : 1);
    if (to < TIME_MIN_MS || to > TIME_MAX_MS) {
      errors.push(OUT_OF_TIME);
      return null;
    }
    return { from, to, how: `${plural(amount, shift.unit)} ${way} than ${formatClock(from)}` };
  }

  if (date) {
    const month = SLIP_MONTHS.indexOf(date.month);
    const now = new Date(from);
    const year =
      date.year ??
      (month < now.getUTCMonth() ||
      (month === now.getUTCMonth() && date.day !== null && date.day < now.getUTCDate())
        ? now.getUTCFullYear() + 1
        : now.getUTCFullYear());
    const day = date.day ?? 15;
    const to = Date.UTC(year, month, day);
    if (new Date(to).getUTCDate() !== day) {
      errors.push(`There is no ${day} ${date.month} ${year}.`);
      return null;
    }
    if (to < TIME_MIN_MS || to > TIME_MAX_MS) {
      errors.push(OUT_OF_TIME);
      return null;
    }
    const what =
      date.day === null
        ? `mid-${date.month} ${year}, so the whole month is in view`
        : `${day} ${date.month} ${year}, from the start of the day`;
    const inferred =
      date.year === null ? `; no year in your text, so the next ${date.month} was used` : '';
    return { from, to, how: `${what}${inferred}` };
  }
  return null;
}

/**
 * The app's reading of the assistant's reply: the mission, the new time, the needs (before and
 * after), and everything that was dropped or blocks Apply.
 */
export function planSlip(reading: SlipReading, context: SlipContext): SlipPlan {
  const { text, missions, selected, time } = context;
  const numbers = numbersInText(text);
  const dropped: string[] = [];
  const errors: string[] = [];

  let mission: SlipMissionRead = { kind: 'selected', mission: selected };
  if (reading.missionName !== null) {
    if (appearsIn(reading.missionName, text)) {
      const name = reading.missionName.trim().replace(/\s+/g, ' ');
      const known = findMissionByName(missions, name);
      mission = known ? { kind: 'known', mission: known } : { kind: 'unknown', name };
    } else {
      dropped.push("A mission name that isn't in your text was not used.");
    }
  }
  const base = mission.kind === 'unknown' ? null : mission.mission;

  const accepted: Partial<Record<MissionField, number>> = {};
  for (const { key, field } of NEED_FIELDS) {
    const value = reading[key];
    if (value === null) continue;
    if (inText(value, numbers)) accepted[field] = value;
    else
      dropped.push(
        `${MISSION_RANGES[field].label}: the number isn't in your text, so it was not used.`,
      );
  }
  let relay: boolean | null = null;
  if (reading.relay !== null) {
    if (/\brelay/i.test(text)) relay = reading.relay;
    else dropped.push("Relay: your text doesn't mention a relay, so it was not used.");
  }

  const start = base ? draftFrom(base, base.name) : null;
  const values: Record<MissionField, string> = {
    minSunElevationDeg: start?.values.minSunElevationDeg ?? '',
    minEarthElevationDeg: start?.values.minEarthElevationDeg ?? '',
    daysNeeded: start?.values.daysNeeded ?? '',
  };
  for (const { field } of NEED_FIELDS) {
    const value = accepted[field];
    if (value !== undefined) values[field] = String(value);
  }
  const draft: MissionDraft = {
    name: base ? base.name : mission.kind === 'unknown' ? mission.name : '',
    values,
    hasRelay: relay ?? base?.hasRelay ?? false,
  };

  // The form's own rules: an impossible value is reported, never changed.
  const problems = validateDraft(draft);
  for (const { field } of NEED_FIELDS) {
    const value = accepted[field];
    const problem = problems[field];
    if (value !== undefined && problem) {
      errors.push(`${MISSION_RANGES[field].label} ${needText(field, value)}: ${problem}`);
    }
  }
  if (mission.kind === 'unknown' && mission.name.length > MISSION_NAME_MAX) {
    errors.push(`The mission name is too long: ${MISSION_NAME_MAX} characters at most.`);
  }

  const needs: SlipNeedLine[] = NEED_FIELDS.map(({ field }) => {
    const value = accepted[field];
    const before = base ? needText(field, base[field]) : null;
    const after = value !== undefined ? needText(field, value) : (before ?? 'Not given');
    return {
      field,
      label: MISSION_RANGES[field].label,
      before,
      after,
      mentioned: value !== undefined,
      changed: base !== null && value !== undefined && value !== base[field],
    };
  });
  const relayText = (value: boolean) => (value ? 'Yes' : 'No');
  needs.push({
    field: 'hasRelay',
    label: 'Relay',
    before: base ? relayText(base.hasRelay) : null,
    after: relay !== null ? relayText(relay) : base ? relayText(base.hasRelay) : 'Not given',
    mentioned: relay !== null,
    changed: base !== null && relay !== null && relay !== base.hasRelay,
  });
  const changed = needs.some((line) => line.changed);

  const slipTime = readTime(reading, text, numbers, time, dropped, errors);

  const unclear = reading.unclear.filter((quote) => appearsIn(quote, text));
  const unclearHidden = reading.unclear.length - unclear.length;
  const read =
    reading.missionName !== null ||
    reading.shift !== null ||
    reading.date !== null ||
    reading.relay !== null ||
    NEED_FIELDS.some(({ key }) => reading[key] !== null);
  const empty = !read && reading.unclear.length === 0;

  const switches = mission.kind === 'known' && mission.mission.id !== selected.id;
  const canApply =
    mission.kind !== 'unknown' && errors.length === 0 && (slipTime !== null || changed || switches);

  return {
    mission,
    time: slipTime,
    draft,
    needs,
    changed,
    errors,
    dropped,
    unclear,
    unclearHidden,
    empty,
    readAny: read,
    canApply,
  };
}
