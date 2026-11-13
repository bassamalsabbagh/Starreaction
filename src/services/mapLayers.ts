/**
 * The map layers made from the team's south-pole rasters by scripts/data/make_map_layers.py
 * (docs/LANDER_RULES.md, "Map layers: elevation and slope"; DATA_SOURCES SRC-073). The description
 * is src/data/layers/index.json; the files are in public/data/layers/<layer>/:
 *
 * - display/*.png: the team's colours on longitude/latitude images (four quarters of the cap at the
 *   160 m view, one 40 m image per patch), for the globe's imagery layers;
 * - values/<level>/<row>_<col>.bin: 256 × 256 value tiles, little-endian, row 0 at the top.
 *
 * Values are read only from the value tiles (never from a colour), one tile at a time, when a point
 * is asked for. The layers never change with the date or time.
 */
import { toPolarXY } from '../utils/elevationGrid';
import type { LatLon } from '../utils/lunarSky';

export interface LayerEncoding {
  readonly type: 'int16' | 'uint16';
  /** value = stored × scale + offset */
  readonly scale: number;
  readonly offset: number;
  /** The stored number that means "no data". */
  readonly nodata: number;
  readonly unit: string;
}

export interface LayerLevel {
  /** "base" (the whole cap) or a patch's site id ("im1", "im2"). */
  readonly id: string;
  readonly pixelM: number;
  /** The level's first column and row, in its own pixels from the raster's top-left corner. */
  readonly col0: number;
  readonly row0: number;
  readonly width: number;
  readonly height: number;
  /** The tiles that exist, as [row, col]; any other tile holds no data. */
  readonly tiles: readonly (readonly [number, number])[];
}

export interface LayerImage {
  readonly file: string;
  readonly west: number;
  readonly east: number;
  readonly south: number;
  readonly north: number;
}

export interface LegendStop {
  readonly value: number;
  readonly color: string;
}

export interface MapLayer {
  readonly id: string;
  readonly label: string;
  readonly unit: string;
  readonly values: {
    readonly encoding: LayerEncoding;
    readonly levels: readonly LayerLevel[];
  } | null;
  /** Why the values can't be read (e.g. the values file arrived empty), or null. */
  readonly valuesUnavailable: string | null;
  readonly display: {
    /** The whole cap at the 160 m view, as four longitude quarters. */
    readonly base: readonly LayerImage[];
    /** The same quarters, small (512 px): shown first while the full images load. */
    readonly preview: readonly LayerImage[];
    readonly patches: readonly (LayerImage & { readonly id: string })[];
  };
  readonly legend: {
    readonly stops: readonly LegendStop[];
    readonly min: number;
    readonly max: number;
  } | null;
}

export interface MapLayersManifest {
  readonly version: 1;
  readonly sourceId: string;
  readonly projection: {
    readonly radiusM: number;
    readonly originX: number;
    readonly originY: number;
    /** The rasters' own pixel size (40 m). */
    readonly pixelM: number;
    readonly widthPx: number;
    readonly heightPx: number;
  };
  /** The layers cover the pole out to this latitude (−80). */
  readonly coverMaxLatDeg: number;
  readonly tileSize: number;
  readonly layers: readonly MapLayer[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function readImage(value: unknown): LayerImage | null {
  if (!isRecord(value) || typeof value.file !== 'string' || !/^[\w-]+\.png$/.test(value.file)) {
    return null;
  }
  const { west, east, south, north } = value;
  if (!isNumber(west) || !isNumber(east) || !isNumber(south) || !isNumber(north)) return null;
  return { file: value.file, west, east, south, north };
}

function readLevel(value: unknown): LayerLevel | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !/^[\w-]+$/.test(value.id)) return null;
  const { pixelM, col0, row0, width, height, tiles } = value;
  if (![pixelM, col0, row0, width, height].every(isNumber) || !Array.isArray(tiles)) return null;
  const pairs = tiles.filter(
    (tile): tile is [number, number] =>
      Array.isArray(tile) && tile.length === 2 && tile.every((n) => Number.isInteger(n)),
  );
  if (pairs.length !== tiles.length) return null;
  return {
    id: value.id,
    pixelM: pixelM as number,
    col0: col0 as number,
    row0: row0 as number,
    width: width as number,
    height: height as number,
    tiles: pairs,
  };
}

function readLayer(value: unknown): MapLayer | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.label !== 'string') {
    return null;
  }
  if (typeof value.unit !== 'string' || !isRecord(value.display)) return null;
  const base = Array.isArray(value.display.base) ? value.display.base.map(readImage) : [];
  const preview = Array.isArray(value.display.preview) ? value.display.preview.map(readImage) : [];
  const patchList = Array.isArray(value.display.patches) ? value.display.patches : [];
  const patches = patchList.map((entry: unknown) => {
    const image = readImage(entry);
    return image && isRecord(entry) && typeof entry.id === 'string'
      ? { ...image, id: entry.id }
      : null;
  });
  if ([...base, ...preview, ...patches].some((image) => !image)) return null;
  let values: MapLayer['values'] = null;
  if (value.values !== null) {
    if (!isRecord(value.values) || !isRecord(value.values.encoding)) return null;
    const e = value.values.encoding;
    if ((e.type !== 'int16' && e.type !== 'uint16') || typeof e.unit !== 'string') return null;
    if (!isNumber(e.scale) || !isNumber(e.offset) || !isNumber(e.nodata)) return null;
    const levels = Array.isArray(value.values.levels) ? value.values.levels.map(readLevel) : [];
    if (levels.length === 0 || levels.some((level) => !level)) return null;
    values = {
      encoding: { type: e.type, scale: e.scale, offset: e.offset, nodata: e.nodata, unit: e.unit },
      levels: levels as LayerLevel[],
    };
  }
  let legend: MapLayer['legend'] = null;
  if (isRecord(value.legend) && Array.isArray(value.legend.stops)) {
    const stops = value.legend.stops.filter(
      (stop: unknown): stop is LegendStop =>
        isRecord(stop) &&
        isNumber(stop.value) &&
        typeof stop.color === 'string' &&
        /^#[0-9a-f]{6}$/i.test(stop.color),
    );
    if (isNumber(value.legend.min) && isNumber(value.legend.max) && stops.length > 1) {
      legend = { stops, min: value.legend.min, max: value.legend.max };
    }
  }
  return {
    id: value.id,
    label: value.label,
    unit: value.unit,
    values,
    valuesUnavailable: typeof value.valuesUnavailable === 'string' ? value.valuesUnavailable : null,
    display: {
      base: base as LayerImage[],
      preview: preview as LayerImage[],
      patches: patches as (LayerImage & { id: string })[],
    },
    legend,
  };
}

/** The checked description, or null when there is none or it can't be read. */
export function readMapLayers(raw: unknown): MapLayersManifest | null {
  if (!isRecord(raw) || raw.version !== 1 || typeof raw.sourceId !== 'string') return null;
  const p = raw.projection;
  if (!isRecord(p)) return null;
  const { radiusM, originX, originY, pixelM, widthPx, heightPx } = p;
  if (![radiusM, originX, originY, pixelM, widthPx, heightPx].every(isNumber)) return null;
  if (!isNumber(raw.coverMaxLatDeg) || !isNumber(raw.tileSize) || !Array.isArray(raw.layers)) {
    return null;
  }
  const layers = raw.layers.map(readLayer);
  if (layers.some((layer) => !layer)) return null;
  return {
    version: 1,
    sourceId: raw.sourceId,
    projection: {
      radiusM: radiusM as number,
      originX: originX as number,
      originY: originY as number,
      pixelM: pixelM as number,
      widthPx: widthPx as number,
      heightPx: heightPx as number,
    },
    coverMaxLatDeg: raw.coverMaxLatDeg,
    tileSize: raw.tileSize,
    layers: layers as MapLayer[],
  };
}

const found = import.meta.glob<unknown>('../data/layers/index.json', {
  eager: true,
  import: 'default',
});

/** The map layers, or null when they have not been built. */
export const MAP_LAYERS: MapLayersManifest | null = readMapLayers(Object.values(found)[0]);

/** A layer file's address (display images and value tiles). */
export function layerFileUrl(layerId: string, path: string): string {
  return `${import.meta.env.BASE_URL}data/layers/${layerId}/${path}`;
}

export type LayerSpot =
  | { readonly kind: 'outside' }
  | {
      readonly kind: 'inside';
      readonly level: LayerLevel;
      readonly tileRow: number;
      readonly tileCol: number;
      /** Pixel inside the tile. */
      readonly col: number;
      readonly row: number;
      /** False when the tile was not written (it holds no data). */
      readonly hasTile: boolean;
    };

/**
 * Where a point's value lives: a patch (40 m) when the point is inside one, otherwise the 160 m
 * base; "outside" north of 80° S or off the rasters. The pixel containing the point is used, as
 * GIS tools' "identify" does.
 */
export function locateValue(
  manifest: MapLayersManifest,
  layer: MapLayer,
  point: LatLon,
): LayerSpot {
  if (!layer.values || point.lat > manifest.coverMaxLatDeg) return { kind: 'outside' };
  const p = manifest.projection;
  const { x, y } = toPolarXY(point, p.radiusM);
  const col = Math.floor((x - p.originX) / p.pixelM);
  const row = Math.floor((p.originY - y) / p.pixelM);
  if (col < 0 || row < 0 || col >= p.widthPx || row >= p.heightPx) return { kind: 'outside' };
  const tile = manifest.tileSize;
  const levels = layer.values.levels;
  const patch = levels.find(
    (level) =>
      level.id !== 'base' &&
      level.pixelM === p.pixelM &&
      col >= level.col0 &&
      col < level.col0 + level.width &&
      row >= level.row0 &&
      row < level.row0 + level.height,
  );
  const base = levels.find((level) => level.id === 'base');
  const level = patch ?? base;
  if (!level) return { kind: 'outside' };
  const factor = level.pixelM / p.pixelM;
  const levelCol = Math.floor(col / factor) - level.col0;
  const levelRow = Math.floor(row / factor) - level.row0;
  if (levelCol < 0 || levelRow < 0 || levelCol >= level.width || levelRow >= level.height) {
    return { kind: 'outside' };
  }
  const tileRow = Math.floor(levelRow / tile);
  const tileCol = Math.floor(levelCol / tile);
  return {
    kind: 'inside',
    level,
    tileRow,
    tileCol,
    col: levelCol % tile,
    row: levelRow % tile,
    hasTile: level.tiles.some(([r, c]) => r === tileRow && c === tileCol),
  };
}

/** One stored number of a tile as a value, or null for NoData (a stored 0 is a real value). */
export function decodeStored(
  view: DataView,
  index: number,
  encoding: LayerEncoding,
): number | null {
  const stored =
    encoding.type === 'uint16' ? view.getUint16(index * 2, true) : view.getInt16(index * 2, true);
  if (stored === encoding.nodata) return null;
  return stored * encoding.scale + encoding.offset;
}

export type LayerReading =
  | { readonly kind: 'outside' }
  | { readonly kind: 'unavailable'; readonly reason: string }
  | { readonly kind: 'nodata'; readonly levelId: string; readonly pixelM: number }
  | {
      readonly kind: 'value';
      readonly value: number;
      readonly unit: string;
      readonly levelId: string;
      readonly pixelM: number;
    }
  | { readonly kind: 'error' };

const TILE_CACHE_LIMIT = 48;
const tiles = new Map<string, Promise<DataView | null>>();

function loadTile(url: string, bytes: number, fetchImpl: typeof fetch): Promise<DataView | null> {
  const load = tiles.get(url);
  if (load) {
    // Most recently used goes to the end, so the oldest is dropped first.
    tiles.delete(url);
    tiles.set(url, load);
    return load;
  }
  const attempt: Promise<DataView | null> = (async () => {
    try {
      const response = await fetchImpl(url);
      if (!response.ok) return null;
      const buffer = await response.arrayBuffer();
      return buffer.byteLength === bytes ? new DataView(buffer) : null;
    } catch {
      return null;
    }
  })().then((view) => {
    // A failed load is not kept, so a later read tries again; but only this attempt is dropped,
    // never a newer one for the same tile.
    if (!view && tiles.get(url) === attempt) tiles.delete(url);
    return view;
  });
  tiles.set(url, attempt);
  while (tiles.size > TILE_CACHE_LIMIT) {
    const oldest = tiles.keys().next().value;
    if (oldest === undefined) break;
    tiles.delete(oldest);
  }
  return attempt;
}

/**
 * The layer's value at a point, fetching only the one tile it is in. "outside" north of 80° S or
 * off the rasters; "unavailable" when the layer has no values (with the reason); "nodata" where the
 * raster holds no data; "error" when the tile could not be loaded.
 */
export async function layerValueAt(
  layer: MapLayer,
  point: LatLon,
  manifest: MapLayersManifest | null = MAP_LAYERS,
  fetchImpl: typeof fetch = fetch,
): Promise<LayerReading> {
  if (!manifest) return { kind: 'outside' };
  if (!layer.values) {
    if (point.lat > manifest.coverMaxLatDeg) return { kind: 'outside' };
    return { kind: 'unavailable', reason: layer.valuesUnavailable ?? 'No values for this layer.' };
  }
  const spot = locateValue(manifest, layer, point);
  if (spot.kind === 'outside') return spot;
  const { level } = spot;
  if (!spot.hasTile) return { kind: 'nodata', levelId: level.id, pixelM: level.pixelM };
  const size = manifest.tileSize;
  const url = layerFileUrl(layer.id, `values/${level.id}/${spot.tileRow}_${spot.tileCol}.bin`);
  const view = await loadTile(url, size * size * 2, fetchImpl);
  if (!view) return { kind: 'error' };
  const value = decodeStored(view, spot.row * size + spot.col, layer.values.encoding);
  if (value === null) return { kind: 'nodata', levelId: level.id, pixelM: level.pixelM };
  return {
    kind: 'value',
    value,
    unit: layer.values.encoding.unit,
    levelId: level.id,
    pixelM: level.pixelM,
  };
}
