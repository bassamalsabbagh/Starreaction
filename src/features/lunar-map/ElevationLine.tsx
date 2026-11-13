import { useCallback } from 'react';
import { StatusTag } from '../../components/StatusTag';
import {
  MAP_LAYERS,
  layerValueAt,
  type MapLayer,
  type MapLayersManifest,
} from '../../services/mapLayers';
import type { LatLon } from '../../utils/lunarSky';
import { OUTSIDE_TEXT, readingStatus, readoutText } from './mapLayerState';
import { useLayerReading } from './useLayerReading';
import styles from './ElevationLine.module.css';

/** One layer's value at the place, from its value tiles, always named ("Elevation: No data"). */
function LayerValue({
  layer,
  place,
  manifest,
}: {
  layer: MapLayer;
  place: LatLon;
  manifest: MapLayersManifest;
}) {
  const read = useCallback(
    (which: MapLayer, point: LatLon) => layerValueAt(which, point, manifest),
    [manifest],
  );
  const reading = useLayerReading(layer, place, read);
  const status = reading ? readingStatus(reading) : null;
  const text = reading
    ? reading.kind === 'value'
      ? readoutText(layer, reading)
      : `${layer.label}: ${readoutText(layer, reading)}`
    : `${layer.label}: reading…`;
  return (
    <span className={styles.main}>
      {text}
      {status ? <StatusTag>{status}</StatusTag> : null}
    </span>
  );
}

/**
 * Elevation and slope on the place card (docs/LANDER_RULES.md, "Map layers: elevation and slope"):
 * each map layer's value at the place, with its resolution and status, read from the team's value
 * tiles; outside 80° S to the pole, one line saying so. Facts only, no pass/fail.
 */
export function ElevationLine({
  place,
  manifest = MAP_LAYERS,
}: {
  place: LatLon;
  manifest?: MapLayersManifest | null;
}) {
  if (!manifest) return null;
  const inside = place.lat <= manifest.coverMaxLatDeg;
  return (
    <p className={styles.line} data-testid="elevation-line">
      {inside ? (
        manifest.layers.map((layer) => (
          <LayerValue key={layer.id} layer={layer} place={place} manifest={manifest} />
        ))
      ) : (
        <span className={styles.main}>
          {manifest.layers.map((layer) => layer.label).join(' and ')}: {OUTSIDE_TEXT}
        </span>
      )}
      {inside ? (
        <span className={styles.sub}>
          Slope: average over one pixel (160 m or 40 m), not a pass/fail.
        </span>
      ) : null}
      <span className={styles.sub}>Team raster ({manifest.sourceId}; origin to be recorded)</span>
    </p>
  );
}
