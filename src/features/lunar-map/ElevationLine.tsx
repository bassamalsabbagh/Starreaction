import { elevationAt, formatElevation } from '../../utils/elevationGrid';
import type { LatLon } from '../../utils/lunarSky';
import type { ElevationState } from './useElevationGrid';
import styles from './ElevationLine.module.css';

/**
 * Elevation and slope on the place card (docs/LANDER_RULES.md, "Elevation and slope at a point"):
 * a fact with its source and pixel size, or why there is none. No pass/fail.
 */
export function ElevationLine({ place, elevation }: { place: LatLon; elevation: ElevationState }) {
  let main: string;
  let sub: string | null = null;
  if (elevation.status === 'none') main = 'No elevation data loaded yet';
  else if (elevation.status === 'loading') main = 'Loading elevation data…';
  else if (elevation.status === 'failed') main = 'The elevation data could not be loaded';
  else {
    const { manifest } = elevation.grid;
    const result = elevationAt(elevation.grid, place);
    if (result.kind === 'ok') {
      main = formatElevation(result);
      sub = `${manifest.source.title} (${manifest.source.id}) · ${Math.round(manifest.pixelSizeM)} m per pixel`;
    } else {
      main = 'No elevation data here';
      sub = `The elevation data covers the pole out to ${Math.abs(manifest.maxLatDeg)}° S`;
    }
  }
  return (
    <p className={styles.line} data-testid="elevation-line">
      <span className={styles.main}>{main}</span>
      {sub ? <span className={styles.sub}>{sub}</span> : null}
    </p>
  );
}
