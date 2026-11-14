import { useEffect, useState } from 'react';
import { layerValueAt, type LayerReading, type MapLayer } from '../../services/mapLayers';
import type { LatLon } from '../../utils/lunarSky';

/**
 * The reading of every layer in `layers` at a point, by layer id (the same one-tile reads as
 * useLayerReading, one per layer, in parallel). While a new point's answers are on their way the
 * last readings stay; an answer for an older point is dropped. Empty with no point.
 */
export function useLayerReadings(
  layers: readonly MapLayer[],
  point: LatLon | null,
  read: (layer: MapLayer, point: LatLon) => Promise<LayerReading> = layerValueAt,
): Readonly<Record<string, LayerReading>> {
  const [state, setState] = useState<Readonly<Record<string, LayerReading>>>({});
  const ids = layers.map((layer) => layer.id).join(',');
  const key = point && ids ? `${ids}|${point.lat}|${point.lon}` : null;
  useEffect(() => {
    if (!point || key === null) return undefined;
    let live = true;
    for (const layer of layers) {
      void read(layer, point).then((reading) => {
        if (live) setState((current) => ({ ...current, [layer.id]: reading }));
      });
    }
    return () => {
      live = false;
    };
    // The key stands for the layers and the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, read]);
  if (!point) return {};
  return Object.fromEntries(
    layers.flatMap((layer) => {
      const reading = state[layer.id];
      return reading ? [[layer.id, reading] as const] : [];
    }),
  );
}
