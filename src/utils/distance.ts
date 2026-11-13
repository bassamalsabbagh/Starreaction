/**
 * Distances on the Moon (docs/LANDER_RULES.md, "Distances"; team equation sheet 2.1): haversine on
 * a sphere of R = 1737.4 km. Pure.
 */
import { MOON_RADIUS_KM, type LatLon } from './lunarSky';

const DEG = Math.PI / 180;

/** The south pole, for "X km from the south pole" (the same formula to latitude −90°). */
export const SOUTH_POLE: LatLon = { lat: -90, lon: 0 };

/** d = 2R·asin√(sin²(Δφ/2) + cos φ₁·cos φ₂·sin²(Δλ/2)), km. */
export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * MOON_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, h)));
}

/** "299.3 km", one decimal. */
export function formatKm(km: number): string {
  return `${km.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}
