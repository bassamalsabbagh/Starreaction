/**
 * How a real landing site's record reads on its card (data/sites.json): its coordinates as the
 * data gives them and its landing date. Pure.
 */
import type { LatLon } from '../../utils/lunarSky';
import { formatDayMonth } from '../../utils/time';

/**
 * "80.13° S, 1.44° E": latitude north-positive and longitude east-positive (the app's convention),
 * with every digit the data has, so nothing is rounded away or added.
 */
export function formatSiteCoordinates(point: LatLon): string {
  const axis = (value: number, positive: string, negative: string) =>
    `${Math.abs(value)}° ${value < 0 ? negative : positive}`;
  return `${axis(point.lat, 'N', 'S')}, ${axis(point.lon, 'E', 'W')}`;
}

/** "2024-02-22" (UTC) → "22 Feb 2024"; anything else is shown as it is. */
export function formatLandingDate(dateUtc: string): string {
  const ms = Date.parse(`${dateUtc}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateUtc) || !Number.isFinite(ms)) return dateUtc;
  return `${formatDayMonth(ms)} ${new Date(ms).getUTCFullYear()}`;
}
