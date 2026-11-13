/**
 * The map layers' state and words (docs/LANDER_RULES.md, "Map layers: elevation and slope"): which
 * images the globe draws and in what order, which layer the readout uses, how a reading reads, and
 * the legend's scale. Everything follows the manifest (src/services/mapLayers.ts), so a new layer
 * (roughness, average visibility, a date-dependent one) is a new manifest entry. Pure.
 */
import type { LayerReading, MapLayer } from '../../services/mapLayers';
import type { DataStatus } from '../../services/sites';

/** A layer's switch and opacity (0–1). */
export interface LayerSetting {
  readonly visible: boolean;
  readonly opacity: number;
}

export const DEFAULT_LAYER_OPACITY = 0.8;

/** One image for the globe: a longitude/latitude PNG over its rectangle, degrees. */
export interface LayerImageSpec {
  readonly key: string;
  readonly url: string;
  readonly west: number;
  readonly east: number;
  readonly south: number;
  readonly north: number;
}

/** What the globe draws for one layer, bottom to top: the previews first, then the full images. */
export interface LayerDisplay {
  readonly id: string;
  readonly visible: boolean;
  readonly opacity: number;
  /** The small quarters, shown while the full ones load. */
  readonly preview: readonly LayerImageSpec[];
  /** The full quarters, then the 40 m patches on top; they replace the previews once loaded. */
  readonly full: readonly LayerImageSpec[];
}

/** A layer's images in drawing order: previews, then the full quarters, then the patches. */
export function layerImagePlan(
  layer: MapLayer,
  urlFor: (layerId: string, path: string) => string,
): { preview: LayerImageSpec[]; full: LayerImageSpec[] } {
  const spec = (image: MapLayer['display']['base'][number]): LayerImageSpec => ({
    key: `${layer.id}/${image.file}`,
    url: urlFor(layer.id, `display/${image.file}`),
    west: image.west,
    east: image.east,
    south: image.south,
    north: image.north,
  });
  return {
    preview: layer.display.preview.map(spec),
    full: [...layer.display.base.map(spec), ...layer.display.patches.map(spec)],
  };
}

/**
 * What the globe draws, in the manifest's order (the first layer lowest: elevation under slope).
 * A layer never switched on has no setting and is not visible, so nothing of it loads.
 */
export function layerDisplays(
  layers: readonly MapLayer[],
  settings: Readonly<Record<string, LayerSetting>>,
  urlFor: (layerId: string, path: string) => string,
  previewOnly = false,
): LayerDisplay[] {
  return layers.map((layer) => {
    const setting = settings[layer.id];
    const plan = layerImagePlan(layer, urlFor);
    return {
      id: layer.id,
      visible: setting?.visible ?? false,
      opacity: setting?.opacity ?? DEFAULT_LAYER_OPACITY,
      preview: plan.preview,
      // A narrow or low-memory device keeps the previews only (previewsOnly).
      full: previewOnly ? [] : plan.full,
    };
  });
}

/**
 * The layer readings come from: the most recently switched-on visible layer that has values;
 * failing that, the most recently switched-on visible layer (its readout then says why there are
 * no values); null when none is visible.
 */
export function defaultActiveLayer(
  layers: readonly MapLayer[],
  enabledOrder: readonly string[],
  settings: Readonly<Record<string, LayerSetting>>,
): string | null {
  const visible = [...enabledOrder]
    .reverse()
    .filter((id) => settings[id]?.visible && layers.some((layer) => layer.id === id));
  const withValues = visible.find((id) => layers.find((layer) => layer.id === id)?.values);
  return withValues ?? visible[0] ?? null;
}

export const OUTSIDE_TEXT = 'No data here: this tool covers 80° S to the pole';

/** The number of decimals the layer stores (slope 0.01° → 2, elevation 1 m → 0). */
export function storedDecimals(layer: MapLayer): number {
  const scale = layer.values?.encoding.scale ?? 1;
  return Math.max(0, Math.round(-Math.log10(scale)));
}

/** "12.28°", "0.00°", "−1234 m": the stored precision, the unit after it. */
export function formatLayerValue(layer: MapLayer, value: number): string {
  const unit = layer.values?.encoding.unit ?? layer.unit;
  const number = value.toFixed(storedDecimals(layer));
  return unit === '°' ? `${number}°` : `${number} ${unit}`;
}

/** "Slope 12.28° · 40 m", "No data", the coverage note, "Unavailable: …", or a load failure. */
export function readoutText(layer: MapLayer, reading: LayerReading): string {
  switch (reading.kind) {
    case 'value':
      return `${layer.label} ${formatLayerValue(layer, reading.value)} · ${reading.pixelM} m`;
    case 'nodata':
      return 'No data';
    case 'outside':
      return OUTSIDE_TEXT;
    case 'unavailable':
      return `Unavailable: ${reading.reason}`;
    case 'error':
      return 'Couldn’t load this value';
  }
}

/** A value's data status: Real data at the raster's own 40 m, Calculated at 160 m (a mean). */
export function readingStatus(reading: LayerReading): DataStatus | null {
  if (reading.kind !== 'value') return null;
  return reading.pixelM <= 40 ? 'Real data' : 'Calculated';
}

/** The legend: a CSS gradient from the stops, and labelled ticks that don't crowd, 0–1 along. */
export function legendScale(legend: NonNullable<MapLayer['legend']>): {
  gradient: string;
  ticks: { at: number; value: number }[];
} {
  const span = legend.max - legend.min || 1;
  const at = (value: number) => Math.min(1, Math.max(0, (value - legend.min) / span));
  const gradient = `linear-gradient(to right, ${legend.stops
    .map((stop) => `${stop.color} ${(at(stop.value) * 100).toFixed(2)}%`)
    .join(', ')})`;
  const ticks: { at: number; value: number }[] = [];
  const values = [...legend.stops.map((stop) => stop.value), legend.max];
  for (const value of values) {
    const place = at(value);
    const last = ticks[ticks.length - 1];
    if (!last || place - last.at >= 0.1) ticks.push({ at: place, value });
  }
  // The maximum always closes the scale, even when it crowds the tick before it.
  const final = ticks[ticks.length - 1];
  if (final && final.value !== legend.max) ticks[ticks.length - 1] = { at: 1, value: legend.max };
  return { gradient, ticks };
}

/** No surface point lies below z = −1, so this leaves the whole Moon shaded. */
export const SHADE_EVERYWHERE = -2;

/**
 * Where the globe's Sun-and-relief shading stops (the relief shader's `unshadedBelowZ`): while any
 * layer is visible, south of its coverage (z = sin of the coverage latitude, −0.9848 at 80° S), so
 * the layers show their true colours, never darkened or moved by the app's time; otherwise nowhere.
 */
export function unshadedBelowZ(
  displays: readonly Pick<LayerDisplay, 'visible'>[],
  coverMaxLatDeg: number,
): number {
  return displays.some((display) => display.visible)
    ? Math.sin((coverMaxLatDeg * Math.PI) / 180)
    : SHADE_EVERYWHERE;
}

/**
 * Narrow or low-memory devices keep the 512 px previews only: both layers' full images are about
 * 300 MB decoded (a viewport under 900 px wide, or navigator.deviceMemory of 4 GB or less).
 */
export function previewsOnly(viewportWidth: number, deviceMemoryGb: number | undefined): boolean {
  return viewportWidth < 900 || (deviceMemoryGb !== undefined && deviceMemoryGb <= 4);
}
