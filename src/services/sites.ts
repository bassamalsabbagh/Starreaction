/**
 * The real landing sites, read from data/sites.json and checked against its schema
 * (docs/LANDER_RULES.md, "Real landing sites"). Every problem in the file is listed at once and the
 * load fails, so a bad file stops `npm run check` (tests/unit/services/sites.test.ts) instead of
 * reaching the app half-read.
 */
import type { LatLon } from '../utils/lunarSky';

/** Where a value comes from, shown next to it ("Real data", "Calculated", "Assumed", "Unavailable"). */
export type DataStatus = 'Real data' | 'Calculated' | 'Assumed' | 'Unavailable';

export interface Site extends LatLon {
  readonly id: string;
  readonly name: string;
  /** A place name ("near Malapert A"), or null. */
  readonly region: string | null;
  /** Latitude, degrees, north-positive (south is negative). */
  readonly lat: number;
  /** Longitude, degrees, east-positive (the file's `lonEast`; the app's LatLon convention). */
  readonly lon: number;
  /** A URL, or "TODO (…)" while the coordinates have no opened source. */
  readonly coordSource: string;
  /** A short note on the coordinates (e.g. planned target vs observed site), or null. */
  readonly coordNote: string | null;
  /** docs/DATA_SOURCES.md entries behind the record (coordinates, landing date). */
  readonly sourceIds: readonly string[];
  /** Matches a lander id in data/landers.json. */
  readonly landerId: string;
  /** "YYYY-MM-DD", UTC. */
  readonly landingDateUtc: string;
  /** A URL, or "TODO (…)": where the landing date comes from. */
  readonly landingDateSource: string;
  readonly landingOutcome: string;
  /** A URL, or "TODO (…)": until then the landing outcome is a draft ("source TODO"). */
  readonly landingOutcomeSource: string;
  readonly missionOutcome: string;
  /** A URL, or "TODO (…)": until then the mission outcome is a draft ("source TODO"). */
  readonly missionOutcomeSource: string;
  /** Why the site is in the tool, one line (a team draft). */
  readonly why: string;
}

/** True when a source field is still a placeholder ("TODO (Ayah)"). */
export function isTodoSource(source: string): boolean {
  return /^TODO\b/i.test(source.trim());
}

/** Coordinates are sourced only when they have a URL; otherwise they are labelled "source TODO". */
export function coordStatus(site: Site): 'sourced' | 'source TODO' {
  return isTodoSource(site.coordSource) ? 'source TODO' : 'sourced';
}

/** Each outcome has its own source; without one it is labelled "source TODO". */
export function outcomeStatus(site: Site, which: 'landing' | 'mission'): 'sourced' | 'source TODO' {
  const source = which === 'landing' ? site.landingOutcomeSource : site.missionOutcomeSource;
  return isTodoSource(source) ? 'source TODO' : 'sourced';
}

export class SiteDataError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`data/sites.json is not valid:\n- ${problems.join('\n- ')}`);
    this.name = 'SiteDataError';
  }
}

const ID = /^[a-z0-9][a-z0-9-]*$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRealDate(text: string): boolean {
  const match = DATE.exec(text);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  if (y === undefined || m === undefined || d === undefined) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** A source field: a web address or a "TODO (…)" placeholder. */
function isSourceText(value: unknown): value is string {
  return typeof value === 'string' && (/^https?:\/\/\S+$/.test(value) || isTodoSource(value));
}

/**
 * The sites in a parsed data/sites.json, in file order. Throws SiteDataError listing every
 * problem: a missing or mistyped field, a latitude outside −90…90 or a longitude outside −180…180,
 * a date that does not exist, a repeated id, or an empty list.
 */
export function parseSites(raw: unknown): readonly Site[] {
  const problems: string[] = [];
  if (!isRecord(raw) || !Array.isArray(raw.sites)) {
    throw new SiteDataError(['expected an object with a "sites" list']);
  }
  if (raw.sites.length === 0) problems.push('"sites" is empty');
  const sites: Site[] = [];
  const seen = new Set<string>();
  raw.sites.forEach((entry: unknown, index) => {
    const where = `sites[${index}]`;
    if (!isRecord(entry)) {
      problems.push(`${where} is not an object`);
      return;
    }
    const before = problems.length;
    const text = (key: string): string => {
      const value = entry[key];
      if (typeof value !== 'string' || value.trim() === '') {
        problems.push(`${where}.${key} must be a non-empty string`);
        return '';
      }
      return value;
    };
    const number = (key: string, min: number, max: number): number => {
      const value = entry[key];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
        problems.push(`${where}.${key} must be a number from ${min} to ${max}`);
        return 0;
      }
      return value;
    };
    const id = text('id');
    if (id && !ID.test(id))
      problems.push(`${where}.id "${id}" must be lower-case letters, digits, -`);
    if (id && seen.has(id)) problems.push(`${where}.id "${id}" is repeated`);
    seen.add(id);
    const name = text('name');
    const region = entry.region;
    if (region !== null && (typeof region !== 'string' || region.trim() === '')) {
      problems.push(`${where}.region must be a non-empty string or null`);
    }
    const lat = number('lat', -90, 90);
    const lon = number('lonEast', -180, 180);
    const landingDateUtc = text('landingDateUtc');
    if (landingDateUtc && !isRealDate(landingDateUtc)) {
      problems.push(`${where}.landingDateUtc "${landingDateUtc}" must be a real date, YYYY-MM-DD`);
    }
    for (const key of [
      'coordSource',
      'landingDateSource',
      'landingOutcomeSource',
      'missionOutcomeSource',
    ]) {
      if (!isSourceText(entry[key])) {
        problems.push(`${where}.${key} must be a URL or "TODO (…)"`);
      }
    }
    const coordNote = entry.coordNote ?? null;
    if (coordNote !== null && (typeof coordNote !== 'string' || coordNote.trim() === '')) {
      problems.push(`${where}.coordNote must be a non-empty string or null`);
    }
    const sourceIds = entry.sourceIds;
    if (
      !Array.isArray(sourceIds) ||
      !sourceIds.every((value) => typeof value === 'string' && /^SRC-\d{3}$/.test(value))
    ) {
      problems.push(`${where}.sourceIds must be a list of "SRC-123" ids (may be empty)`);
    }
    const source = (key: string) => (typeof entry[key] === 'string' ? (entry[key] as string) : '');
    const landingOutcomeSource = source('landingOutcomeSource');
    const missionOutcomeSource = source('missionOutcomeSource');
    const record: Site = {
      id,
      name,
      region: typeof region === 'string' ? region : null,
      lat,
      lon,
      coordSource: source('coordSource'),
      coordNote: typeof coordNote === 'string' ? coordNote : null,
      sourceIds: Array.isArray(sourceIds) ? sourceIds.map(String) : [],
      landerId: text('landerId'),
      landingDateUtc,
      landingDateSource: source('landingDateSource'),
      landingOutcome: text('landingOutcome'),
      landingOutcomeSource,
      missionOutcome: text('missionOutcome'),
      missionOutcomeSource,
      why: text('why'),
    };
    if (problems.length === before) sites.push(record);
  });
  if (problems.length > 0) throw new SiteDataError(problems);
  return sites;
}

const found = import.meta.glob<unknown>('../../data/sites.json', {
  eager: true,
  import: 'default',
});

/** The real sites (data/sites.json), checked. */
export const SITES: readonly Site[] = parseSites(Object.values(found)[0]);

export function findSite(id: string): Site | undefined {
  return SITES.find((site) => site.id === id);
}
