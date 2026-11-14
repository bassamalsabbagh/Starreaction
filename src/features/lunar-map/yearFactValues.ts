/**
 * A site's light, water and Earth over the year (docs/LANDER_RULES.md, "Light, water and Earth over
 * the year"): Light and Water come from the PGDA south-polar lighting product, which is not loaded
 * yet (and does not reach sites north of 80° S); Earth is calculated from the JPL Horizons series
 * over calendar 2027. Pure.
 */
import { shareAbove, YEAR_RANGE, type HorizonsSeries } from '../../services/horizonsData';
import type { YearFact } from '../../types/yearFact';
import type { LatLon } from '../../utils/lunarSky';
import { horizonAt, type HorizonProfile } from '../../utils/terrainShadow';

/** The PGDA south-polar products cover 80° S to the pole. */
export const POLAR_DATA_EDGE_LAT = -80;

const NOT_LOADED = 'Unavailable: the PGDA lighting file isn’t loaded yet';
const OUTSIDE = 'Not applicable: outside south-polar data';

/** Light, water and Earth over the year for one site. */
export function yearFacts(
  site: LatLon,
  series: HorizonsSeries | null,
  terrain: HorizonProfile | null,
  /** Loading has finished: no series now means its file didn't load. */
  settled = false,
): readonly YearFact[] {
  const polar = site.lat <= POLAR_DATA_EDGE_LAT;
  const lighting = (id: 'light' | 'water', label: string): YearFact => ({
    id,
    label,
    value: polar ? NOT_LOADED : OUTSIDE,
    status: 'Unavailable',
    source: polar
      ? 'PGDA south-polar lighting product (terrain included)'
      : 'PGDA south-polar lighting product, 80° S to the pole',
  });
  const share = series
    ? shareAbove(
        series,
        'earth',
        site,
        YEAR_RANGE,
        terrain ? (azimuth) => horizonAt(terrain, azimuth) : undefined,
      )
    : null;
  const horizon = terrain ? 'terrain horizon' : 'flat horizon';
  const earth: YearFact = share
    ? {
        id: 'earth',
        label: 'Earth above the horizon in 2027',
        value: `${share.pct.toFixed(1)}% of 2027`,
        status: 'Calculated',
        source: `JPL Horizons, 2027, ${horizon}`,
      }
    : {
        id: 'earth',
        label: 'Earth above the horizon in 2027',
        value: series
          ? 'Unavailable: the JPL Horizons file doesn’t cover 2027'
          : settled
            ? 'Unavailable: the JPL Horizons file didn’t load'
            : 'Unavailable until the JPL Horizons positions load',
        status: 'Unavailable',
        source: 'JPL Horizons, 2027',
      };
  return [
    lighting('light', '% of the year in sunlight'),
    lighting('water', 'Nearest permanent shadow (where ice may be)'),
    earth,
  ];
}
