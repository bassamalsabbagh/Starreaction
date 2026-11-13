/**
 * The "launch slipped" assistant's reply: what the AI read from the user's text, and nothing
 * else. The server (api/slip.ts) asks for exactly this shape; the browser checks it again here
 * before anything uses it. Every field may be null. Pure.
 */

/** The longest text the assistant reads, in characters (the server enforces the same). */
export const SLIP_TEXT_MAX = 500;

export const SLIP_UNITS = ['days', 'weeks', 'months', 'years'] as const;
export type SlipUnit = (typeof SLIP_UNITS)[number];

export const SLIP_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;
export type SlipMonth = (typeof SLIP_MONTHS)[number];

/** At most this many "unclear" quotes, each at most this long, are read. */
export const SLIP_UNCLEAR_MAX = 5;
export const SLIP_QUOTE_MAX = 200;

/** A calendar month in a question, with its year only when typed. */
export interface SlipQuestionMonth {
  readonly month: SlipMonth;
  readonly year: number | null;
}

/** The questions the app answers (docs/LANDER_RULES.md, assistant rule 9). */
export const SLIP_QUESTION_ABOUT = ['when', 'where', 'sunlight', 'earth', 'passes'] as const;
export type SlipQuestionAbout = (typeof SLIP_QUESTION_ABOUT)[number];

/** "When is the best time to land in March?", "Which site is best?". */
export interface SlipQuestion {
  readonly about: SlipQuestionAbout;
  /** A site named in the question, exactly as typed. */
  readonly siteName: string | null;
  readonly from: SlipQuestionMonth | null;
  readonly to: SlipQuestionMonth | null;
}

export interface SlipReading {
  /** The mission's name exactly as typed, or null. */
  readonly missionName: string | null;
  /** "Slipped 3 weeks": the amount as typed (negative when earlier) and its unit. */
  readonly shift: { readonly shift: number; readonly unit: SlipUnit } | null;
  /** "12 March 2027", "March": the day and year when typed. */
  readonly date: {
    readonly day: number | null;
    readonly month: SlipMonth;
    readonly year: number | null;
  } | null;
  readonly powerDays: number | null;
  readonly minSunDeg: number | null;
  readonly minEarthDeg: number | null;
  readonly relay: boolean | null;
  /** A question about when or where to land (the app answers it; the AI never does). */
  readonly question: SlipQuestion | null;
  /** Word-for-word quotes of what could not be read. */
  readonly unclear: readonly string[];
}

/** The reply's fields, in order (the server's schema lists the same; a test keeps them equal). */
export const SLIP_FIELDS = [
  'missionName',
  'shift',
  'date',
  'powerDays',
  'minSunDeg',
  'minEarthDeg',
  'relay',
  'question',
  'unclear',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactly(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function nullableNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  return isNumber(value) ? value : undefined;
}

function wholeOrNull(value: unknown, min: number, max: number): number | null | undefined {
  if (value === null) return null;
  return isNumber(value) && Number.isInteger(value) && value >= min && value <= max
    ? value
    : undefined;
}

function readShift(value: unknown): SlipReading['shift'] | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !hasExactly(value, ['shift', 'unit'])) return undefined;
  const { shift, unit } = value;
  if (!isNumber(shift)) return undefined;
  const found = SLIP_UNITS.find((entry) => entry === unit);
  return found ? { shift, unit: found } : undefined;
}

function readDate(value: unknown): SlipReading['date'] | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !hasExactly(value, ['day', 'month', 'year'])) return undefined;
  const month = SLIP_MONTHS.find((entry) => entry === value.month);
  const day = wholeOrNull(value.day, 1, 31);
  const year = wholeOrNull(value.year, 0, 9999);
  if (!month || day === undefined || year === undefined) return undefined;
  return { day, month, year };
}

function readQuestionMonth(value: unknown): SlipQuestionMonth | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !hasExactly(value, ['month', 'year'])) return undefined;
  const month = SLIP_MONTHS.find((entry) => entry === value.month);
  const year = wholeOrNull(value.year, 0, 9999);
  if (!month || year === undefined) return undefined;
  return { month, year };
}

function readQuestion(value: unknown): SlipQuestion | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !hasExactly(value, ['about', 'siteName', 'from', 'to'])) {
    return undefined;
  }
  const about = SLIP_QUESTION_ABOUT.find((entry) => entry === value.about);
  const siteName =
    value.siteName === null
      ? null
      : typeof value.siteName === 'string' && value.siteName.trim() !== ''
        ? value.siteName
        : undefined;
  const from = readQuestionMonth(value.from);
  const to = readQuestionMonth(value.to);
  if (!about || siteName === undefined || from === undefined || to === undefined) {
    return undefined;
  }
  return { about, siteName, from, to };
}

/**
 * The reply, checked field by field, or null when anything is missing, extra or of the wrong
 * type. Nothing is repaired: a malformed reply counts as no reply.
 */
export function readSlipReading(value: unknown): SlipReading | null {
  if (!isRecord(value) || !hasExactly(value, SLIP_FIELDS)) return null;
  const missionName =
    value.missionName === null
      ? null
      : typeof value.missionName === 'string' && value.missionName.trim() !== ''
        ? value.missionName
        : undefined;
  const shift = readShift(value.shift);
  const date = readDate(value.date);
  const powerDays = nullableNumber(value.powerDays);
  const minSunDeg = nullableNumber(value.minSunDeg);
  const minEarthDeg = nullableNumber(value.minEarthDeg);
  const relay =
    value.relay === null ? null : typeof value.relay === 'boolean' ? value.relay : undefined;
  const question = readQuestion(value.question);
  const unclear =
    Array.isArray(value.unclear) &&
    value.unclear.length <= SLIP_UNCLEAR_MAX &&
    value.unclear.every((item) => typeof item === 'string' && item.length <= SLIP_QUOTE_MAX)
      ? (value.unclear as string[])
      : undefined;
  if (
    missionName === undefined ||
    shift === undefined ||
    date === undefined ||
    powerDays === undefined ||
    minSunDeg === undefined ||
    minEarthDeg === undefined ||
    relay === undefined ||
    question === undefined ||
    unclear === undefined
  ) {
    return null;
  }
  return {
    missionName,
    shift,
    date,
    powerDays,
    minSunDeg,
    minEarthDeg,
    relay,
    question,
    unclear,
  };
}
