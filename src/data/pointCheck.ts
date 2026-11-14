/**
 * "Anywhere on the Moon": the same power and comms checks as a site, for any point, from the real
 * Sun and Earth (docs/LANDER_RULES.md). A point gets exactly what a site gets; it is only not on
 * the list.
 */
import { greatCircleKm, type LatLon } from '../utils/lunarSky';
import { formatCoordinate } from '../utils/selenographic';
import { siteSky, type SkySample } from '../utils/skyVisibility';
import type { TimeRange } from '../utils/time';
import { SITES, type Site } from '../services/sites';
import { assessSky, type DemoMission, type SkyAssessment } from './demoData';

/** "12.4° N, 31.8° W": how the app names a picked point everywhere. */
export function pointLabel(point: LatLon): string {
  return formatCoordinate(point, 1);
}

export interface PointCheck {
  point: LatLon;
  assessment: SkyAssessment;
  nearest: { site: Site; distanceKm: number } | null;
}

/** The nearest landing site to a point, with the great-circle distance (whole km). */
export function nearestSite(
  point: LatLon,
  sites: readonly Site[] = SITES,
): { site: Site; distanceKm: number } | null {
  let best: { site: Site; distanceKm: number } | null = null;
  for (const site of sites) {
    const distanceKm = Math.round(greatCircleKm(point, site));
    if (!best || distanceKm < best.distanceKm) best = { site, distanceKm };
  }
  return best;
}

/**
 * The checks for one point, from the same hourly samples and range the site list uses, so a point
 * on a site gets the same answer as the site.
 */
export function checkPoint(
  point: LatLon,
  mission: DemoMission,
  samples: readonly SkySample[],
  range: TimeRange,
  sites: readonly Site[] = SITES,
): PointCheck {
  return {
    point,
    assessment: assessSky(siteSky(samples, point, mission, range), mission, range),
    nearest: nearestSite(point, sites),
  };
}
