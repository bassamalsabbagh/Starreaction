/**
 * Where the Sun or the Earth is in a place's sky now, and when it next sets or rises over the
 * horizon: the challenge's "time remaining before sunset or Earthset". Real geometry (lunarSky),
 * on the app's smooth sphere, so the horizon is 0° elevation (no terrain yet, KNOWN_ISSUES KI-014).
 *
 * The search steps through the cached hourly samples, then narrows the crossing down to about a
 * minute by bisection with direct ephemeris calls. Pure, no React.
 */
import { azimuthElevationOf, elevationOf, lunarSky, type LatLon, type Vec3 } from './lunarSky';
import { skyAtHour } from './skyVisibility';
import { DAY_MS, HOUR_MS } from './time';

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

function position(body: SkyBody, ms: number): Vec3 {
  const sky = lunarSky(new Date(ms));
  return body === 'sun' ? sky.sun : sky.earth;
}

/** The body's position now, and its next crossing of the horizon (`horizonDeg`, default 0°). */
export function bodyNow(
  place: LatLon,
  body: SkyBody,
  time: number,
  horizonDeg = 0,
  searchMs = RISE_SET_SEARCH_MS,
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
