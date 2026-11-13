/**
 * Where the Sun or the Earth is in a place's sky now, and when it next sets or rises over the
 * horizon: the challenge's "time remaining before sunset or Earthset". Real geometry (lunarSky),
 * on the app's smooth sphere, so the horizon is 0° elevation (no terrain yet, KNOWN_ISSUES KI-014).
 *
 * With the app's engine, the search steps through the cached hourly samples, then narrows the
 * crossing down to about a minute by bisection with direct ephemeris calls. With a site's own
 * samples (JPL Horizons every 10 minutes, docs/LANDER_RULES.md "Sun and Earth positions: JPL
 * Horizons"), it steps through those samples and places the crossing by straight-line
 * interpolation between the two around it; outside the samples' dates the engine takes over.
 * Pure, no React.
 */
import { azimuthElevationOf, elevationOf, lunarSky, type LatLon, type Vec3 } from './lunarSky';
import { skyAtHour } from './skyVisibility';
import { DAY_MS, HOUR_MS, formatCountdown } from './time';

export type SkyBody = 'sun' | 'earth';

export interface BodyNow {
  elevationDeg: number;
  azimuthDeg: number;
  up: boolean;
  /** The next set (while up) or rise (while down), or null when none comes within the search. */
  next: { kind: 'set' | 'rise'; at: number } | null;
}

/** How far ahead to look for the next set or rise: a little over a lunar day. */
export const RISE_SET_SEARCH_MS = 32 * DAY_MS;

/**
 * A site's own position samples (e.g. JPL Horizons): every `stepMs` from `startMs`, the body's
 * azimuth and elevation in degrees, interpolated between samples; null outside its dates.
 */
export interface PositionSamples {
  readonly startMs: number;
  readonly stepMs: number;
  azEl(body: SkyBody, t: number): { azimuth: number; elevation: number } | null;
}

export interface BodyNowOptions {
  /** The horizon the body rises over and sets below, degrees (default 0°, a smooth Moon). */
  horizonDeg?: number;
  searchMs?: number;
  /** The site's own samples, used where they have the time; the engine elsewhere. */
  positions?: PositionSamples | null;
}

function position(body: SkyBody, ms: number): Vec3 {
  const sky = lunarSky(new Date(ms));
  return body === 'sun' ? sky.sun : sky.earth;
}

/**
 * The countdown to the next crossing, worded as a forecast: "Forecast: dark in 2 d 4 h" (sunset),
 * "Forecast: Sun rises in …", "Forecast: Earth sets in …", "Forecast: Earth rises in …".
 */
export function forecastText(
  body: SkyBody,
  next: NonNullable<BodyNow['next']>,
  time: number,
): string {
  const left = formatCountdown(next.at - time);
  if (body === 'sun') {
    return next.kind === 'set' ? `Forecast: dark in ${left}` : `Forecast: Sun rises in ${left}`;
  }
  return `Forecast: Earth ${next.kind === 'set' ? 'sets' : 'rises'} in ${left}`;
}

/**
 * The body's position now, and its next crossing of the horizon: from `positions` when they cover
 * `time`, otherwise from the engine.
 */
export function bodyNow(
  place: LatLon,
  body: SkyBody,
  time: number,
  { horizonDeg = 0, searchMs = RISE_SET_SEARCH_MS, positions = null }: BodyNowOptions = {},
): BodyNow {
  const now = positions?.azEl(body, time) ?? null;
  if (!positions || !now) return engineBodyNow(place, body, time, horizonDeg, searchMs);
  const up = now.elevation >= horizonDeg;
  const result = (next: BodyNow['next']): BodyNow => ({
    elevationDeg: now.elevation,
    azimuthDeg: now.azimuth,
    up,
    next,
  });
  let lastT = time;
  let lastElevation = now.elevation;
  const { startMs, stepMs } = positions;
  const first = startMs + (Math.floor((time - startMs) / stepMs) + 1) * stepMs;
  for (let t = first; t <= time + searchMs; t += stepMs) {
    const sample = positions.azEl(body, t);
    if (!sample) {
      // The samples end before the search does: the engine carries on from the last one.
      const rest = engineBodyNow(place, body, lastT, horizonDeg, time + searchMs - lastT);
      return result(rest.up === up ? rest.next : { kind: up ? 'set' : 'rise', at: lastT });
    }
    if (sample.elevation >= horizonDeg !== up) {
      const fraction = (horizonDeg - lastElevation) / (sample.elevation - lastElevation);
      return result({ kind: up ? 'set' : 'rise', at: lastT + fraction * (t - lastT) });
    }
    lastT = t;
    lastElevation = sample.elevation;
  }
  return result(null);
}

/** The engine's answer: hourly samples, then bisection to about a minute. */
function engineBodyNow(
  place: LatLon,
  body: SkyBody,
  time: number,
  horizonDeg: number,
  searchMs: number,
): BodyNow {
  const target = position(body, time);
  const { azimuth, elevation } = azimuthElevationOf(target, place);
  const up = elevation >= horizonDeg;
  const above = (ms: number, vector?: Vec3) =>
    elevationOf(vector ?? position(body, ms), place) >= horizonDeg;

  let before = time;
  let next: BodyNow['next'] = null;
  for (let hour = Math.floor(time / HOUR_MS) + 1; hour * HOUR_MS <= time + searchMs; hour += 1) {
    const at = hour * HOUR_MS;
    const sample = skyAtHour(hour);
    if (above(at, body === 'sun' ? sample.sun : sample.earth) !== up) {
      // The crossing lies between the last hour on the same side and this one: narrow it down.
      let low = before;
      let high = at;
      while (high - low > 60_000) {
        const middle = (low + high) / 2;
        if (above(middle) === up) low = middle;
        else high = middle;
      }
      next = { kind: up ? 'set' : 'rise', at: high };
      break;
    }
    before = at;
  }
  return { elevationDeg: elevation, azimuthDeg: azimuth, up, next };
}
