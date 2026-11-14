import { useEffect, useState } from 'react';
import { layerValueAt, type LayerReading, type MapLayer } from '../../services/mapLayers';
import type { LatLon } from '../../utils/lunarSky';

/**
 * A layer's reading at a point (one value tile fetched when needed, never the whole raster). While
 * a new point's answer is on its way, the last reading for the same layer stays, so the readout
 * does not flash or chatter; an answer for an older point is dropped. Null with no layer or point,
 * and before the layer's first answer.
 */
export function useLayerReading(
  layer: MapLayer | null,
  point: LatLon | null,
  read: (layer: MapLayer, point: LatLon) => Promise<LayerReading> = layerValueAt,
): LayerReading | null {
  const [state, setState] = useState<{ layerId: string; reading: LayerReading } | null>(null);
  const key = layer && point ? `${layer.id}|${point.lat}|${point.lon}` : null;
  useEffect(() => {
    if (!layer || !point || key === null) return undefined;
    let live = true;
    void read(layer, point).then((reading) => {
      if (live) setState({ layerId: layer.id, reading });
    });
    return () => {
      live = false;
    };
    // The key stands for the layer and the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, read]);
  if (!layer || !point) return null;
  return state && state.layerId === layer.id ? state.reading : null;
}
