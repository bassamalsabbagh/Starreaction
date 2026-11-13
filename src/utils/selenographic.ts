import type { SelenographicCoordinate } from '../types/selenographic';

export const LATITUDE_MIN = -90;
export const LATITUDE_MAX = 90;
export const LONGITUDE_MIN = -180;
export const LONGITUDE_MAX = 180;

const MINUS_SIGN = '−';

/** Formats a range bound with an explicit sign, e.g. "−90°", "+90°", "0°". */
function formatDegreeBound(value: number): string {
  if (value > 0) return `+${value}°`;
  if (value < 0) return `${MINUS_SIGN}${Math.abs(value)}°`;
  return '0°';
}

/** Formats an inclusive degree range for display, e.g. "−90° to +90°". */
export function formatDegreeRange(min: number, max: number): string {
  return `${formatDegreeBound(min)} to ${formatDegreeBound(max)}`;
}

/**
 * Single source of truth for the coordinate convention. The UI renders from this object so that
 * displayed text and validation logic cannot drift apart. The convention is provisional until it
 * is confirmed against the data sources recorded in docs/DATA_SOURCES.md.
 */
export const COORDINATE_CONVENTION = {
  unit: 'decimal degrees',
  latitude: { min: LATITUDE_MIN, max: LATITUDE_MAX },
  longitude: { min: LONGITUDE_MIN, max: LONGITUDE_MAX },
  longitudeDirection: 'east-positive',
  status: 'provisional',
  description:
    `Selenographic latitude ${formatDegreeRange(LATITUDE_MIN, LATITUDE_MAX)} and longitude ` +
    `${formatDegreeRange(LONGITUDE_MIN, LONGITUDE_MAX)}, east-positive, in decimal degrees. ` +
    'This convention is provisional and must be confirmed against the data sources once they are recorded.',
} as const;

export function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= LATITUDE_MIN && value <= LATITUDE_MAX;
}

export function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= LONGITUDE_MIN && value <= LONGITUDE_MAX;
}

export function isValidCoordinate(coordinate: SelenographicCoordinate): boolean {
  return isValidLatitude(coordinate.lat) && isValidLongitude(coordinate.lon);
}

/** Collapses −0 to 0 so callers never see a signed zero. */
function withoutNegativeZero(value: number): number {
  return value === 0 ? 0 : value;
}

/**
 * In-range values (including exactly ±180) are returned unchanged; other finite values wrap into
 * [−180, 180). Non-finite input returns NaN.
 */
export function normalizeLongitude(value: number): number {
  if (!Number.isFinite(value)) return Number.NaN;
  if (value >= LONGITUDE_MIN && value <= LONGITUDE_MAX) return withoutNegativeZero(value);
  const span = LONGITUDE_MAX - LONGITUDE_MIN;
  const wrapped = ((((value - LONGITUDE_MIN) % span) + span) % span) + LONGITUDE_MIN;
  return withoutNegativeZero(wrapped);
}

export type CoordinateParseResult =
  | { readonly ok: true; readonly value: SelenographicCoordinate }
  | { readonly ok: false; readonly error: string };

/** Longest accepted query, in characters. Reuse as the search input's `maxLength`. */
export const MAX_COORDINATE_QUERY_LENGTH = 100;

const NUMBER_PATTERN = String.raw`(?:\d+(?:\.\d*)?|\.\d+)`;
// Matched only after whitespace normalisation, so the pattern contains no whitespace quantifiers
// and the only separator is a single comma or a single space. This keeps matching linear.
const COMPONENT_PATTERN = String.raw`([+-])?(${NUMBER_PATTERN})(°)?([NSEW])?`;
const QUERY_PATTERN = new RegExp(String.raw`^${COMPONENT_PATTERN}[, ]${COMPONENT_PATTERN}$`, 'i');
const NUMBER_GLOBAL = new RegExp(NUMBER_PATTERN, 'g');
const DISALLOWED_CHARACTER = /[^0-9.+\-°NSEW,\s]/i;
const EXPONENT_NOTATION = /\d[eE][+-]?\d/;

/**
 * Collapses whitespace to single spaces, then drops spaces around commas and before "°" or a
 * hemisphere letter, e.g. "12.5 ° S ,  45 E" → "12.5°S,45E".
 */
function normalizeQueryWhitespace(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/ ?, ?/g, ',')
    .replace(/ (?=[°NSEW])/gi, '');
}

/** Echoes a parsed value in error messages, or undefined when it is too large to print usefully. */
function formatEnteredDegrees(value: number): string | undefined {
  if (!Number.isFinite(value) || Math.abs(value) >= 1e6) return undefined;
  return `${value < 0 ? MINUS_SIGN : ''}${Math.abs(value)}°`;
}

function rangeError(axis: string, min: number, max: number, value: number): string {
  const entered = formatEnteredDegrees(value);
  const range = `${axis} must be from ${formatDegreeRange(min, max)}`;
  return entered === undefined
    ? `${range}; the number entered is far out of range.`
    : `${range} (got ${entered}).`;
}

const FORMAT_HINT =
  'Enter latitude then longitude in decimal degrees, separated by a comma or space, optionally with ° and N/S/E/W.';

function fail(error: string): CoordinateParseResult {
  return { ok: false, error };
}

interface ParsedComponent {
  readonly sign: string | undefined;
  readonly magnitude: number;
  readonly hemisphere: string | undefined;
}

function toSignedValue(component: ParsedComponent, negativeHemisphere: string): number {
  const negative = component.sign === '-' || component.hemisphere === negativeHemisphere;
  return withoutNegativeZero(negative ? -component.magnitude : component.magnitude);
}

/**
 * Parses free-text input such as "12.5, -45", "12.5 -45", "12.5N 45W" or "12.5° S, 45° E".
 * Out-of-range values are rejected, never wrapped or converted (e.g. 0–360° longitudes), because
 * the coordinate convention is still provisional.
 */
export function parseCoordinateQuery(input: string): CoordinateParseResult {
  // Cap length before any regex work so pathological input stays cheap.
  if (input.length > MAX_COORDINATE_QUERY_LENGTH) {
    return fail(`Input is too long (maximum ${MAX_COORDINATE_QUERY_LENGTH} characters).`);
  }
  // The UI displays negative bounds with U+2212, so users may copy or type it.
  const trimmed = input.replaceAll(MINUS_SIGN, '-').trim();
  if (trimmed === '') {
    return fail(`Enter a coordinate. ${FORMAT_HINT}`);
  }
  if (!/\d/.test(trimmed)) {
    return fail(`Coordinates must be numbers. ${FORMAT_HINT}`);
  }
  const unexpected = trimmed.split(/[\s,]+/).find((part) => DISALLOWED_CHARACTER.test(part));
  if (unexpected !== undefined) {
    return fail(`Unexpected text "${unexpected}". ${FORMAT_HINT}`);
  }
  if (EXPONENT_NOTATION.test(trimmed)) {
    return fail(`Exponent notation (e.g. "1e5") is not supported. ${FORMAT_HINT}`);
  }
  const numberCount = trimmed.match(NUMBER_GLOBAL)?.length ?? 0;
  if (numberCount !== 2) {
    return fail(`Expected exactly two numbers (latitude and longitude) but found ${numberCount}.`);
  }

  const match = QUERY_PATTERN.exec(normalizeQueryWhitespace(trimmed));
  if (!match) {
    return fail(`Could not read the coordinate. ${FORMAT_HINT}`);
  }
  const [, latSign, latNumber, , latHemi, lonSign, lonNumber, , lonHemi] = match;
  if (latNumber === undefined || lonNumber === undefined) {
    return fail(`Could not read the coordinate. ${FORMAT_HINT}`);
  }
  const lat: ParsedComponent = {
    sign: latSign,
    magnitude: Number(latNumber),
    hemisphere: latHemi?.toUpperCase(),
  };
  const lon: ParsedComponent = {
    sign: lonSign,
    magnitude: Number(lonNumber),
    hemisphere: lonHemi?.toUpperCase(),
  };

  if (
    (lat.sign !== undefined && lat.hemisphere !== undefined) ||
    (lon.sign !== undefined && lon.hemisphere !== undefined)
  ) {
    return fail('Use either a sign (+/−) or a hemisphere letter (N/S/E/W) for a value, not both.');
  }
  if (
    (lat.hemisphere !== undefined && lat.hemisphere !== 'N' && lat.hemisphere !== 'S') ||
    (lon.hemisphere !== undefined && lon.hemisphere !== 'E' && lon.hemisphere !== 'W')
  ) {
    return fail(
      'Hemisphere letters are on the wrong axis: give latitude first (N/S), then longitude (E/W).',
    );
  }

  const latValue = toSignedValue(lat, 'S');
  const lonValue = toSignedValue(lon, 'W');
  if (!isValidLatitude(latValue)) {
    return fail(rangeError('Latitude', LATITUDE_MIN, LATITUDE_MAX, latValue));
  }
  if (!isValidLongitude(lonValue)) {
    return fail(
      `${rangeError('Longitude', LONGITUDE_MIN, LONGITUDE_MAX, lonValue)} ` +
        'Values such as 0–360° are not converted automatically.',
    );
  }
  return { ok: true, value: { lat: latValue, lon: lonValue } };
}

const DEFAULT_PRECISION = 2;
const MAX_PRECISION = 10;

function safePrecision(precision: number): number {
  if (!Number.isFinite(precision)) return DEFAULT_PRECISION;
  return Math.min(Math.max(Math.round(precision), 0), MAX_PRECISION);
}

function formatAxis(
  value: number,
  digits: number,
  positive: string,
  negative: string,
  unsignedMagnitude?: number,
): string {
  // Round before choosing the hemisphere so values that round to zero never print "0.00° S".
  const text = Math.abs(value).toFixed(digits);
  const rounded = Number(text);
  if (rounded === 0 || rounded === unsignedMagnitude) return `${text}°`;
  return `${text}° ${value > 0 ? positive : negative}`;
}

/**
 * Formats a coordinate as e.g. "12.50° N, 45.00° W". Zero and ±180° longitude carry no hemisphere
 * letter. Invalid coordinates return "Invalid coordinate" instead of throwing.
 */
export function formatCoordinate(
  coordinate: SelenographicCoordinate,
  precision: number = DEFAULT_PRECISION,
): string {
  if (!isValidCoordinate(coordinate)) return 'Invalid coordinate';
  const digits = safePrecision(precision);
  const lat = formatAxis(coordinate.lat, digits, 'N', 'S');
  const lon = formatAxis(coordinate.lon, digits, 'E', 'W', LONGITUDE_MAX);
  return `${lat}, ${lon}`;
}
