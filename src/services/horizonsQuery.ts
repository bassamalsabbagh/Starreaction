/**
 * The JPL Horizons API query for a body seen from a site on the Moon (docs/DATA_SOURCES.md
 * SRC-055): used by scripts/fetch_horizons.ts to fetch the app's data, and by the "View in JPL
 * Horizons" link, which opens the same query in the user's browser tab. The app itself never calls
 * Horizons.
 */
import type { LatLon } from '../utils/lunarSky';
import type { TimeRange } from '../utils/time';

export const HORIZONS_API = 'https://ssd.jpl.nasa.gov/api/horizons.api';

export const HORIZONS_COMMAND = { sun: '10', earth: '399' } as const;

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-11-01 00:00" (UTC), the form Horizons reads for START_TIME and STOP_TIME. */
export function horizonsTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export interface HorizonsQuery {
  readonly body: keyof typeof HORIZONS_COMMAND;
  readonly site: LatLon;
  /** First and last time asked for, UTC ms (Horizons includes both). */
  readonly start: number;
  readonly stop: number;
  /** "10 m", "1 h", … */
  readonly step: string;
  readonly format: 'json' | 'text';
  readonly csv: boolean;
}

/**
 * Observer on the Moon at the site (CENTER coord@301, geodetic east longitude, latitude, 0 km: the
 * reference height, not measured terrain), QUANTITIES 4 (airless apparent azimuth and elevation).
 */
export function horizonsParams(query: HorizonsQuery): Record<string, string> {
  return {
    format: query.format,
    COMMAND: `'${HORIZONS_COMMAND[query.body]}'`,
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'OBSERVER'",
    CENTER: "'coord@301'",
    COORD_TYPE: "'GEODETIC'",
    SITE_COORD: `'${query.site.lon},${query.site.lat},0'`,
    START_TIME: `'${horizonsTime(query.start)}'`,
    STOP_TIME: `'${horizonsTime(query.stop)}'`,
    STEP_SIZE: `'${query.step}'`,
    QUANTITIES: "'4'",
    CSV_FORMAT: query.csv ? "'YES'" : "'NO'",
  };
}

export function horizonsUrl(query: HorizonsQuery): string {
  return `${HORIZONS_API}?${new URLSearchParams(horizonsParams(query)).toString()}`;
}

/**
 * The "View in JPL Horizons" link for a site and range: plain text, 1-hour steps, one body per
 * link (Horizons takes one target per request).
 */
export function viewInHorizonsUrl(
  body: HorizonsQuery['body'],
  site: LatLon,
  range: TimeRange,
): string {
  return horizonsUrl({
    body,
    site,
    start: range.start,
    stop: range.end,
    step: '1 h',
    format: 'text',
    csv: false,
  });
}
