/**
 * Sun and Earth positions from JPL Horizons for the fixed sites (docs/LANDER_RULES.md, "Sun and
 * Earth positions: JPL Horizons"; docs/DATA_SOURCES.md SRC-055). scripts/fetch_horizons.ts saves,
 * per site, the airless apparent azimuth and elevation of both bodies every 10 minutes:
 * src/data/horizons/index.json describes them, public/data/horizons/<site>.bin holds them. Both are
 * optional: without them, or outside their dates, the app uses its own engine (src/utils/lunarSky.ts).
 *
 * Horizons gives directions as seen from the site, so each one is turned into a point along that
 * direction from the site, at our engine's distance for that hour (for the disc's angular radius).
 * The app's existing tests on body-fixed vectors (elevation, "is it up", terrain, the horizon view)
 * then give back exactly Horizons' azimuth and elevation.
 */
import {
  EARTH_RADIUS_KM,
  SUN_RADIUS_KM,
  angularRadiusDeg,
  distanceFromSite,
  surfacePoint,
  type LatLon,
  type LunarSky,
  type Vec3,
} from '../utils/lunarSky';
import { skyAtHour, type SkySample } from '../utils/skyVisibility';
import { HOUR_MS, type TimeRange } from '../utils/time';

export type SkyBody = 'sun' | 'earth';

export const HORIZONS_LABEL = 'Sun and Earth positions: JPL Horizons';

/** Values are stored in hundredths of a degree. */
const SCALE = 0.01;

export interface HorizonsSiteFile {
  readonly id: string;
  readonly file: string;
  readonly lat: number;
  readonly lonEast: number;
  readonly bytes: number;
}

export interface HorizonsIndex {
  readonly version: 1;
  readonly sourceId: string;
  readonly fetchedUtc: string;
  readonly startUtc: string;
  readonly startMs: number;
  readonly stepMinutes: number;
  readonly count: number;
  readonly sites: readonly HorizonsSiteFile[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The checked index, or null when there is none or it is not one this code can read. */
export function readHorizonsIndex(raw: unknown): HorizonsIndex | null {
  if (!isRecord(raw) || raw.version !== 1 || !Array.isArray(raw.sites)) return null;
  const { sourceId, fetchedUtc, startUtc, stepMinutes, count } = raw;
  if (typeof sourceId !== 'string' || typeof fetchedUtc !== 'string') return null;
  if (typeof startUtc !== 'string' || typeof stepMinutes !== 'number') return null;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 2) return null;
  if (!(stepMinutes > 0)) return null;
  const startMs = Date.parse(startUtc);
  if (!Number.isFinite(startMs)) return null;
  const sites: HorizonsSiteFile[] = [];
  for (const entry of raw.sites) {
    if (!isRecord(entry)) return null;
    const { id, file, lat, lonEast, bytes } = entry;
    if (typeof id !== 'string' || typeof file !== 'string' || !/^[\w-]+\.bin$/.test(file)) {
      return null;
    }
    if (typeof lat !== 'number' || typeof lonEast !== 'number') return null;
    if (bytes !== count * 8) return null;
    sites.push({ id, file, lat, lonEast, bytes });
  }
  return { version: 1, sourceId, fetchedUtc, startUtc, startMs, stepMinutes, count, sites };
}

const found = import.meta.glob<unknown>('../data/horizons/index.json', {
  eager: true,
  import: 'default',
});

export const HORIZONS_INDEX: HorizonsIndex | null = readHorizonsIndex(Object.values(found)[0]);

/** One site's Horizons samples: every `stepMs` from `startMs`, in hundredths of a degree. */
export interface HorizonsSeries {
  readonly siteId: string;
  readonly startMs: number;
  readonly stepMs: number;
  readonly count: number;
  readonly sunAz: Uint16Array;
  readonly sunEl: Int16Array;
  readonly earthAz: Uint16Array;
  readonly earthEl: Int16Array;
}

/**
 * The four planar blocks of a site file (little-endian): Sun azimuth (uint16), Sun elevation
 * (int16), Earth azimuth (uint16), Earth elevation (int16), `count` values each. Null when the size
 * does not match.
 */
export function decodeHorizons(
  buffer: ArrayBuffer,
  meta: { siteId: string; startMs: number; stepMs: number; count: number },
): HorizonsSeries | null {
  const { count } = meta;
  if (buffer.byteLength !== count * 8) return null;
  const view = new DataView(buffer);
  const sunAz = new Uint16Array(count);
  const sunEl = new Int16Array(count);
  const earthAz = new Uint16Array(count);
  const earthEl = new Int16Array(count);
  for (let i = 0; i < count; i++) {
    sunAz[i] = view.getUint16(i * 2, true);
    sunEl[i] = view.getInt16(count * 2 + i * 2, true);
    earthAz[i] = view.getUint16(count * 4 + i * 2, true);
    earthEl[i] = view.getInt16(count * 6 + i * 2, true);
  }
  return { ...meta, sunAz, sunEl, earthAz, earthEl };
}

/** The file layout decodeHorizons reads (used by scripts/fetch_horizons.ts and the tests). */
export function encodeHorizons(series: {
  sunAz: ArrayLike<number>;
  sunEl: ArrayLike<number>;
  earthAz: ArrayLike<number>;
  earthEl: ArrayLike<number>;
}): Uint8Array {
  const count = series.sunAz.length;
  const bytes = new Uint8Array(count * 8);
  const view = new DataView(bytes.buffer);
  const azimuth = (degrees: number) => Math.round(degrees / SCALE) % 36000;
  const elevation = (degrees: number) => Math.round(degrees / SCALE);
  for (let i = 0; i < count; i++) {
    view.setUint16(i * 2, azimuth(series.sunAz[i] ?? 0), true);
    view.setInt16(count * 2 + i * 2, elevation(series.sunEl[i] ?? 0), true);
    view.setUint16(count * 4 + i * 2, azimuth(series.earthAz[i] ?? 0), true);
    view.setInt16(count * 6 + i * 2, elevation(series.earthEl[i] ?? 0), true);
  }
  return bytes;
}

/** The first and last sample times (UTC ms) the series holds. */
export function seriesSpan(series: HorizonsSeries): TimeRange {
  return { start: series.startMs, end: series.startMs + (series.count - 1) * series.stepMs };
}

export function seriesCovers(series: HorizonsSeries, t: number): boolean {
  const span = seriesSpan(series);
  return t >= span.start && t <= span.end;
}

/**
 * The body's azimuth and elevation at `t`, degrees: the stored sample when `t` falls on one,
 * otherwise straight-line between the two around it (azimuth the short way round). Null outside
 * the series.
 */
export function horizonsAzEl(
  series: HorizonsSeries,
  body: SkyBody,
  t: number,
): { azimuth: number; elevation: number } | null {
  if (!seriesCovers(series, t)) return null;
  const az = body === 'sun' ? series.sunAz : series.earthAz;
  const el = body === 'sun' ? series.sunEl : series.earthEl;
  const position = (t - series.startMs) / series.stepMs;
  const i = Math.min(Math.floor(position), series.count - 1);
  const f = position - i;
  const az0 = (az[i] ?? 0) * SCALE;
  const el0 = (el[i] ?? 0) * SCALE;
  if (f === 0 || i + 1 >= series.count) return { azimuth: az0, elevation: el0 };
  const az1 = (az[i + 1] ?? 0) * SCALE;
  const el1 = (el[i + 1] ?? 0) * SCALE;
  const turn = ((((az1 - az0) % 360) + 540) % 360) - 180;
  return { azimuth: (((az0 + turn * f) % 360) + 360) % 360, elevation: el0 + (el1 - el0) * f };
}

/**
 * A body-fixed point (km) that appears at this azimuth (clockwise from north) and elevation from
 * the site, `distanceKm` away from it, on the app's smooth sphere: the inverse of
 * `azimuthElevationOf`. The distance sets the disc's angular radius for the upper-limb rule.
 */
export function pointAt(
  site: LatLon,
  azimuthDeg: number,
  elevationDeg: number,
  distanceKm: number,
): Vec3 {
  const DEG = Math.PI / 180;
  const at = surfacePoint(site);
  const r = Math.hypot(at[0], at[1], at[2]);
  const up: Vec3 = [at[0] / r, at[1] / r, at[2] / r];
  const lon = site.lon * DEG;
  const east: Vec3 = [-Math.sin(lon), Math.cos(lon), 0];
  const north: Vec3 = [
    up[1] * east[2] - up[2] * east[1],
    up[2] * east[0] - up[0] * east[2],
    up[0] * east[1] - up[1] * east[0],
  ];
  const a = azimuthDeg * DEG;
  const e = elevationDeg * DEG;
  const horizontal = Math.cos(e);
  const direction = [0, 1, 2].map(
    (k) =>
      horizontal * (Math.sin(a) * (east[k] ?? 0) + Math.cos(a) * (north[k] ?? 0)) +
      Math.sin(e) * (up[k] ?? 0),
  );
  return [
    at[0] + distanceKm * (direction[0] ?? 0),
    at[1] + distanceKm * (direction[1] ?? 0),
    at[2] + distanceKm * (direction[2] ?? 0),
  ];
}

/**
 * The site-to-body distance at `t`, km, from our engine's sample for that hour: the Horizons files
 * hold only directions, and a disc's angular radius barely changes within an hour.
 */
export function engineDistanceKm(site: LatLon, body: SkyBody, t: number): number {
  return distanceFromSite(skyAtHour(Math.floor(t / HOUR_MS))[body], site);
}

/**
 * The Sun and Earth at `t` for this site, as the app's sky vectors: the direction from Horizons,
 * the distance from our engine (`engineDistanceKm`). Null outside the series.
 */
export function horizonsSky(series: HorizonsSeries, site: LatLon, t: number): LunarSky | null {
  const sun = horizonsAzEl(series, 'sun', t);
  const earth = horizonsAzEl(series, 'earth', t);
  if (!sun || !earth) return null;
  return {
    sun: pointAt(site, sun.azimuth, sun.elevation, engineDistanceKm(site, 'sun', t)),
    earth: pointAt(site, earth.azimuth, earth.elevation, engineDistanceKm(site, 'earth', t)),
  };
}

/**
 * The samples for one fixed site inside `range` (docs/LANDER_RULES.md, "Date range and hours"):
 * every stored 10-minute step of its JPL Horizons series where the series covers the time, and one
 * per whole hour from our engine elsewhere (an hour that would run into the series stops where it
 * starts). Each sample carries its own length (`stepMs`). The vectors are only valid for this site.
 * `fromHorizons` counts the samples that came from Horizons.
 */
export function siteSamples(
  series: HorizonsSeries | null,
  site: LatLon,
  range: TimeRange,
): { samples: SkySample[]; fromHorizons: number } {
  const samples: SkySample[] = [];
  let fromHorizons = 0;
  const span = series ? seriesSpan(series) : null;
  let t = range.start;
  while (t < range.end) {
    if (series && span && t >= span.start && t <= span.end) {
      const at = series.startMs + Math.ceil((t - series.startMs) / series.stepMs) * series.stepMs;
      if (at > span.end) {
        t = at;
        continue;
      }
      if (at >= range.end) break;
      const sky = horizonsSky(series, site, at);
      if (sky) {
        samples.push({ t: at, sun: sky.sun, earth: sky.earth, stepMs: series.stepMs });
        fromHorizons += 1;
      }
      t = at + series.stepMs;
      continue;
    }
    const hour = Math.ceil(t / HOUR_MS);
    const at = hour * HOUR_MS;
    if (at >= range.end) break;
    // Rounded up into the series: its own samples take over from there.
    if (span && at >= span.start && at <= span.end) {
      t = at;
      continue;
    }
    const toSeries = span && at < span.start ? span.start - at : HOUR_MS;
    const stepMs = Math.min(HOUR_MS, toSeries);
    const sky = skyAtHour(hour);
    samples.push({
      t: at,
      sun: sky.sun,
      earth: sky.earth,
      ...(stepMs < HOUR_MS ? { stepMs } : {}),
    });
    t = at + stepMs;
  }
  return { samples, fromHorizons };
}

/** Which positions a range used: all from Horizons, none, or some (the rest from the engine). */
export function positionsSource(
  series: HorizonsSeries | null,
  range: TimeRange,
): 'horizons' | 'engine' | 'mixed' {
  if (!series) return 'engine';
  const span = seriesSpan(series);
  if (range.start >= span.start && range.end <= span.end) return 'horizons';
  if (range.end <= span.start || range.start > span.end) return 'engine';
  return 'mixed';
}

/**
 * The year the "% of the year" values use: calendar 2027, the only full year inside the files
 * (docs/LANDER_RULES.md, "Light, water and Earth over the year").
 */
export const YEAR_RANGE: TimeRange = { start: Date.UTC(2027, 0, 1), end: Date.UTC(2028, 0, 1) };

/**
 * The share of the series' samples in [range.start, range.end) with the body's upper limb above
 * the horizon (docs/LANDER_RULES.md, "Is it up: the upper limb"): elevation + angular radius >
 * 0° (flat), or > the terrain horizon in its direction when `horizonDeg` is given. The angular
 * radius uses our engine's site-to-body distance for the sample's hour. Null when the series does
 * not cover the whole range.
 */
export function shareAbove(
  series: HorizonsSeries,
  body: SkyBody,
  site: LatLon,
  range: TimeRange = YEAR_RANGE,
  horizonDeg: (azimuth: number) => number = () => 0,
): { pct: number; samples: number } | null {
  const span = seriesSpan(series);
  if (range.start < span.start || range.end - series.stepMs > span.end) return null;
  const az = body === 'sun' ? series.sunAz : series.earthAz;
  const el = body === 'sun' ? series.sunEl : series.earthEl;
  const radiusKm = body === 'sun' ? SUN_RADIUS_KM : EARTH_RADIUS_KM;
  const first = Math.ceil((range.start - series.startMs) / series.stepMs);
  let samples = 0;
  let up = 0;
  let hour = Number.NaN;
  let limbDeg = 0;
  for (let i = first; series.startMs + i * series.stepMs < range.end; i++) {
    const t = series.startMs + i * series.stepMs;
    // One engine distance per hour (cached by skyAtHour), shared by that hour's samples.
    if (Math.floor(t / HOUR_MS) !== hour) {
      hour = Math.floor(t / HOUR_MS);
      limbDeg = angularRadiusDeg(radiusKm, engineDistanceKm(site, body, t));
    }
    samples += 1;
    if ((el[i] ?? 0) * SCALE + limbDeg > horizonDeg((az[i] ?? 0) * SCALE)) up += 1;
  }
  return { pct: samples ? (up / samples) * 100 : 0, samples };
}

const loads = new Map<string, Promise<HorizonsSeries | null>>();

/**
 * A site's Horizons series, fetched once. Null when there is no index, no file for the site, the
 * file's site position differs from the site's (the file is stale), or the file is missing or the
 * wrong size: the app then uses its own engine.
 */
export function loadHorizonsSeries(
  site: { id: string } & LatLon,
  index: HorizonsIndex | null = HORIZONS_INDEX,
  fetchImpl: typeof fetch = fetch,
): Promise<HorizonsSeries | null> {
  const entry = index?.sites.find((candidate) => candidate.id === site.id);
  if (!index || !entry) return Promise.resolve(null);
  if (Math.abs(entry.lat - site.lat) > 1e-6 || Math.abs(entry.lonEast - site.lon) > 1e-6) {
    return Promise.resolve(null);
  }
  const key = `${index.fetchedUtc}/${entry.file}`;
  let load = loads.get(key);
  if (!load) {
    load = (async () => {
      try {
        const response = await fetchImpl(`${import.meta.env.BASE_URL}data/horizons/${entry.file}`);
        if (!response.ok) return null;
        return decodeHorizons(await response.arrayBuffer(), {
          siteId: site.id,
          startMs: index.startMs,
          stepMs: index.stepMinutes * 60_000,
          count: index.count,
        });
      } catch {
        return null;
      }
    })().then((series) => {
      // A failed load is not kept, so a later call tries again (a network blip at the venue).
      if (!series) loads.delete(key);
      return series;
    });
    loads.set(key, load);
  }
  return load;
}

/** The dates the JPL Horizons files cover (first to last sample), or null without the files. */
export const HORIZONS_COVERAGE: TimeRange | null = HORIZONS_INDEX
  ? {
      start: HORIZONS_INDEX.startMs,
      end:
        HORIZONS_INDEX.startMs + (HORIZONS_INDEX.count - 1) * HORIZONS_INDEX.stepMinutes * 60_000,
    }
  : null;
