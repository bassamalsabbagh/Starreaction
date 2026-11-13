/**
 * Where the Sun and Earth are, seen from the Moon: real geometry from astronomy-engine (MIT,
 * docs/DATA_SOURCES.md). No Cesium import, so it runs in unit tests.
 *
 * Frame: Moon body-fixed, from the IAU WGCCRE 2015 rotation model (pole α0, δ0 and prime meridian
 * W, libration terms included), which approximates the mean-Earth/polar-axis (ME) frame the lunar
 * maps use. x points at 0° N 0° E, z at the north pole, y at 0° N 90° E: the same axes Cesium uses
 * for `Cartesian3.fromDegrees` on the Moon ellipsoid, so these vectors can be used on the globe as
 * they are. Distances in km.
 *
 * Elevations are on a smooth sphere (mean radius): no terrain, so no crater shadows and no
 * horizon hills (docs/KNOWN_ISSUES.md).
 */
import { Body, GeoMoon, GeoVector, KM_PER_AU, RotationAxis, type Vector } from 'astronomy-engine';

/** Mean lunar radius, km (DATA_SOURCES SRC-012; the same as Cesium's Ellipsoid.MOON). */
export const MOON_RADIUS_KM = 1737.4;

export type Vec3 = readonly [number, number, number];

/** The Sun and Earth centres from the Moon's centre, in the body-fixed frame, km. */
export interface LunarSky {
  sun: Vec3;
  earth: Vec3;
}

/** A point on the Moon in degrees (latitude north-positive, longitude east-positive). */
export interface LatLon {
  lat: number;
  lon: number;
}

const DEG = Math.PI / 180;

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function norm(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

function unit(a: Vec3): Vec3 {
  const length = norm(a) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
}

function toKm(v: Vector): Vec3 {
  return [v.x * KM_PER_AU, v.y * KM_PER_AU, v.z * KM_PER_AU];
}

/**
 * A body's body-fixed axes in J2000 equatorial coordinates (EQJ), from the IAU rotation model: the
 * pole, and the prime meridian turned W degrees from the ascending node of the body's equator on
 * the J2000 equator.
 */
function bodyAxes(body: Body, date: Date): { x: Vec3; y: Vec3; z: Vec3 } {
  const axis = RotationAxis(body, date);
  const z: Vec3 = [axis.north.x, axis.north.y, axis.north.z];
  const ra = axis.ra * 15 * DEG;
  const node: Vec3 = [-Math.sin(ra), Math.cos(ra), 0];
  const w = axis.spin * DEG;
  const across = cross(z, node);
  const x: Vec3 = [
    node[0] * Math.cos(w) + across[0] * Math.sin(w),
    node[1] * Math.cos(w) + across[1] * Math.sin(w),
    node[2] * Math.cos(w) + across[2] * Math.sin(w),
  ];
  return { x, y: cross(z, x), z };
}

/** The Sun and Earth seen from the Moon at a moment (both positions in km, body-fixed). */
export function lunarSky(date: Date): LunarSky {
  const moon = toKm(GeoMoon(date));
  const sunGeo = toKm(GeoVector(Body.Sun, date, false));
  const axes = bodyAxes(Body.Moon, date);
  const toBody = (v: Vec3): Vec3 => [dot(v, axes.x), dot(v, axes.y), dot(v, axes.z)];
  return {
    sun: toBody([sunGeo[0] - moon[0], sunGeo[1] - moon[1], sunGeo[2] - moon[2]]),
    earth: toBody([-moon[0], -moon[1], -moon[2]]),
  };
}

/**
 * The Earth's own axes (x at its 0° N 0° E, z at its north pole) in the Moon's body-fixed frame,
 * from the IAU rotation models of both, so a map of the Earth can be turned the right way.
 */
export function earthAxes(date: Date): { x: Vec3; y: Vec3; z: Vec3 } {
  const moon = bodyAxes(Body.Moon, date);
  const earth = bodyAxes(Body.Earth, date);
  const toMoon = (v: Vec3): Vec3 => [dot(v, moon.x), dot(v, moon.y), dot(v, moon.z)];
  return { x: toMoon(earth.x), y: toMoon(earth.y), z: toMoon(earth.z) };
}

/** Unit vector from the Moon's centre towards the Sun, body-fixed. */
export function sunDirection(date: Date): Vec3 {
  return unit(lunarSky(date).sun);
}

/** Unit vector from the Moon's centre towards the Earth, body-fixed. */
export function earthDirection(date: Date): Vec3 {
  return unit(lunarSky(date).earth);
}

/** The surface point directly under a direction (sub-solar or sub-Earth point), in degrees. */
export function subPoint(direction: Vec3): LatLon {
  const v = unit(direction);
  return { lat: Math.asin(v[2]) / DEG, lon: Math.atan2(v[1], v[0]) / DEG };
}

/**
 * Where a body (its centre, body-fixed km) appears from a site: azimuth in degrees clockwise from
 * local north (0–360), and its elevation as `elevationOf` gives it (smooth-sphere horizon).
 */
export function azimuthElevationOf(
  target: Vec3,
  site: LatLon,
): { azimuth: number; elevation: number } {
  const at = surfacePoint(site);
  const up = unit(at);
  const lon = site.lon * DEG;
  const east: Vec3 = [-Math.sin(lon), Math.cos(lon), 0];
  const north = cross(up, east);
  const toTarget = unit([target[0] - at[0], target[1] - at[1], target[2] - at[2]]);
  const azimuth = (Math.atan2(dot(toTarget, east), dot(toTarget, north)) / DEG + 360) % 360;
  return { azimuth, elevation: elevationOf(target, site) };
}

/** The great-circle distance between two surface points on the mean sphere, km. */
export function greatCircleKm(a: LatLon, b: LatLon): number {
  const la1 = a.lat * DEG;
  const la2 = b.lat * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const cosine = Math.sin(la1) * Math.sin(la2) + Math.cos(la1) * Math.cos(la2) * Math.cos(dLon);
  return MOON_RADIUS_KM * Math.acos(Math.max(-1, Math.min(1, cosine)));
}

/** A surface point on the mean sphere, km. */
export function surfacePoint({ lat, lon }: LatLon): Vec3 {
  const la = lat * DEG;
  const lo = lon * DEG;
  return [
    MOON_RADIUS_KM * Math.cos(la) * Math.cos(lo),
    MOON_RADIUS_KM * Math.cos(la) * Math.sin(lo),
    MOON_RADIUS_KM * Math.sin(la),
  ];
}

/**
 * Elevation of a body (its centre) above a site's horizon, degrees, on a smooth sphere. Measured
 * from the site, not the Moon's centre, so the Earth's parallax (up to ~0.3°) is included.
 */
export function elevationOf(target: Vec3, site: LatLon): number {
  const at = surfacePoint(site);
  const up = unit(at);
  const toTarget: Vec3 = [target[0] - at[0], target[1] - at[1], target[2] - at[2]];
  return Math.asin(Math.max(-1, Math.min(1, dot(up, unit(toTarget))))) / DEG;
}

/**
 * A fast "is it at least this high?" test for one site, for hourly sampling: the site's position
 * and its up direction are worked out once, and elevations are compared as sines (no asin).
 */
export function aboveHorizonTest(site: LatLon): (target: Vec3, minElevationDeg: number) => boolean {
  const at = surfacePoint(site);
  const up = unit(at);
  return (target, minElevationDeg) => {
    const dx = target[0] - at[0];
    const dy = target[1] - at[1];
    const dz = target[2] - at[2];
    const sine = (up[0] * dx + up[1] * dy + up[2] * dz) / Math.hypot(dx, dy, dz);
    return sine >= Math.sin(minElevationDeg * DEG);
  };
}

/** The Sun's elevation at a site, degrees (negative: below the horizon). */
export function sunElevation(lat: number, lon: number, date: Date): number {
  return elevationOf(lunarSky(date).sun, { lat, lon });
}

/** The Earth's elevation at a site, degrees (negative: below the horizon). */
export function earthElevation(lat: number, lon: number, date: Date): number {
  return elevationOf(lunarSky(date).earth, { lat, lon });
}

/** "Sun 12° up" or "Sun below horizon" (whole degrees; 0° up means on the horizon). */
export function describeElevation(body: string, elevationDeg: number): string {
  if (elevationDeg < 0) return `${body} below horizon`;
  return `${body} ${Math.round(elevationDeg)}° up`;
}
