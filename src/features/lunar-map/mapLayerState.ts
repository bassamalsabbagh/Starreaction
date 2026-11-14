/**
 * The map layers' state and words (docs/LANDER_RULES.md, "Map layers: elevation and slope"): which
 * images the globe draws and in what order, which layer the readout uses, how a reading reads, and
 * the legend's scale. Everything follows the manifest (src/services/mapLayers.ts), so a new layer
 * (roughness, average visibility, a date-dependent one) is a new manifest entry. Pure.
 */
import type { LayerReading, MapLayer } from '../../services/mapLayers';
import type { DataStatus } from '../../services/sites';
import legendRangeFile from '../../data/layers/legendRange.json';

const LEGEND_RANGE = legendRangeFile as { layers: Record<string, { min: number; max: number }> };

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
      // A phone keeps the low-resolution images only (previewsOnly).
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
  if (layer.id === 'elevation' && unit === 'm') {
    const km = (Math.round(value / 100) / 10).toFixed(1);
    return `${value > 0 ? '+' : ''}${km} km`;
  }
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

/**
 * A value's data status: Real data at a raster's own pixels (the 40 m rasters, or a site patch,
 * e.g. Roughness at 50 m), Calculated on a base grid (a mean of 4 x 4 pixels).
 */
export function readingStatus(reading: LayerReading): DataStatus | null {
  if (reading.kind !== 'value') return null;
  return reading.pixelM <= 40 || reading.levelId !== 'base' ? 'Real data' : 'Calculated';
}

/** A hex colour "#rrggbb" as numbers. */
function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The stops' colour at a value: straight-line between the two stops around it, the ends held. */
function colourAt(stops: readonly { value: number; color: string }[], value: number): string {
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) return '#000000';
  if (value <= first.value) return first.color;
  if (value >= last.value) return last.color;
  for (let i = 1; i < stops.length; i += 1) {
    const upper = stops[i];
    const lower = stops[i - 1];
    if (upper && lower && value <= upper.value) {
      const f = (value - lower.value) / (upper.value - lower.value || 1);
      const [r0, g0, b0] = rgb(lower.color);
      const [r1, g1, b1] = rgb(upper.color);
      const mix = (x: number, y: number) => Math.round(x + (y - x) * f);
      return `#${[mix(r0, r1), mix(g0, g1), mix(b0, b1)]
        .map((c) => c.toString(16).padStart(2, '0'))
        .join('')}`;
    }
  }
  return last.color;
}

/**
 * The legend's ends for a layer: the percentiles of the valid values (scripts/data/legend_range.py,
 * src/data/layers/legendRange.json), not the single most extreme pixels the manifest records; the
 * manifest's own minimum and maximum without a percentile file. Display only.
 */
export function legendRange(
  layerId: string,
  legend: NonNullable<MapLayer['legend']>,
): { min: number; max: number } {
  const own = LEGEND_RANGE.layers[layerId];
  return own ? { min: own.min, max: own.max } : { min: legend.min, max: legend.max };
}

/**
 * The legend: a CSS gradient from the stops and labelled ticks that don't crowd, 0-1 along. With a
 * `range` the bar covers only that range (the stops clipped to it, the colour at each end worked
 * out between its neighbours), so the ends and the colours agree.
 */
export function legendScale(
  legend: NonNullable<MapLayer['legend']>,
  range?: { min: number; max: number },
): {
  gradient: string;
  ticks: { at: number; value: number }[];
} {
  const lo = range?.min ?? legend.min;
  const hi = range?.max ?? legend.max;
  const stops = range
    ? [
        { value: lo, color: colourAt(legend.stops, lo) },
        ...legend.stops.filter((stop) => stop.value > lo && stop.value < hi),
        { value: hi, color: colourAt(legend.stops, hi) },
      ]
    : legend.stops;
  const span = hi - lo || 1;
  const at = (value: number) => Math.min(1, Math.max(0, (value - lo) / span));
  const gradient = `linear-gradient(to right, ${stops
    .map((stop) => `${stop.color} ${(at(stop.value) * 100).toFixed(2)}%`)
    .join(', ')})`;
  const ticks: { at: number; value: number }[] = [];
  const values = [...stops.map((stop) => stop.value), hi];
  for (const value of values) {
    const place = at(value);
    const last = ticks[ticks.length - 1];
    if (!last || place - last.at >= 0.1) ticks.push({ at: place, value });
  }
  // The maximum always closes the scale, even when it crowds the tick before it.
  const final = ticks[ticks.length - 1];
  if (final && final.value !== hi) ticks[ticks.length - 1] = { at: 1, value: hi };
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
 * Phones (a viewport under 600 px wide) keep the 512 px images only: both layers' full images are
 * about 300 MB decoded. Laptops and tablets draw the full-resolution images; nothing is said.
 */
export function previewsOnly(viewportWidth: number): boolean {
  return viewportWidth < 600;
}

/** The two ends of a legend, in words with the real (rounded) minimum and maximum. */
export interface LegendEnds {
  readonly low: string;
  readonly high: string;
}

/** "+7.0 km" / "-7.3 km": metres to kilometres, one decimal, a plain minus. */
function kilometres(metres: number, plus: boolean): string {
  const km = (Math.round(metres / 100) / 10).toFixed(1);
  return `${plus && metres > 0 ? '+' : ''}${km} km`;
}

/**
 * Legend text for a map layer: only the two ends, with words ("Low (crater floors) -7.3 km" …
 * "High (ridges) +7.0 km"), from the layer's real minimum and maximum. Layers without words of
 * their own get the plain numbers and unit.
 */
export function legendEnds(
  layer: Pick<MapLayer, 'id' | 'label' | 'unit'>,
  min: number,
  max: number,
): LegendEnds {
  if (layer.id === 'elevation') {
    return {
      low: `Low (crater floors) ${kilometres(min, false)}`,
      high: `High (ridges) ${kilometres(max, true)}`,
    };
  }
  if (layer.id === 'slope') {
    return {
      low: `Flat, safer to land ${Math.round(min)}°`,
      high: `Steep, risky ${Math.round(max)}°`,
    };
  }
  if (layer.id === 'roughness') {
    return {
      low: `Smooth ${min.toFixed(2)} ${layer.unit}`,
      high: `Rough ${max.toFixed(2)} ${layer.unit}`,
    };
  }
  return { low: `${Math.round(min)} ${layer.unit}`, high: `${Math.round(max)} ${layer.unit}` };
}
