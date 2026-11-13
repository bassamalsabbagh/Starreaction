import { useState } from 'react';
import type { MapLayer } from '../../services/mapLayers';
import { DEFAULT_LAYER_OPACITY, defaultActiveLayer, type LayerSetting } from './mapLayerState';

/**
 * The map layers' switches, opacities and the layer readings come from. Switching a layer on makes
 * the readings follow the most recently switched-on layer that has values, until the user picks one.
 */
export function useMapLayerSettings(layers: readonly MapLayer[]) {
  const [settings, setSettings] = useState<Readonly<Record<string, LayerSetting>>>({});
  const [enabledOrder, setEnabledOrder] = useState<readonly string[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);

  const toggle = (id: string) => {
    const visible = !(settings[id]?.visible ?? false);
    setSettings((current) => ({
      ...current,
      [id]: { visible, opacity: current[id]?.opacity ?? DEFAULT_LAYER_OPACITY },
    }));
    if (visible) {
      setEnabledOrder((order) => [...order.filter((entry) => entry !== id), id]);
      setChosen(null);
    } else if (chosen === id) {
      setChosen(null);
    }
  };
  const setOpacity = (id: string, opacity: number) =>
    setSettings((current) => ({
      ...current,
      [id]: { visible: current[id]?.visible ?? false, opacity },
    }));

  const automatic = defaultActiveLayer(layers, enabledOrder, settings);
  const activeId = chosen !== null && settings[chosen]?.visible ? chosen : automatic;
  const anyVisible = layers.some((layer) => settings[layer.id]?.visible);
  return { settings, toggle, setOpacity, activeId, setActive: setChosen, anyVisible };
}
