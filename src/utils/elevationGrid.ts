/**
 * Elevation and slope at a point from a south-pole LOLA height grid (docs/LANDER_RULES.md,
 * "Elevation and slope at a point"). Pure: no fetching, no React, no Cesium. The grid comes from
 * scripts/data/elevation_grid.py; its JSON description is checked here before anything uses it.
 */
import type { LatLon } from './lunarSky';

/** The mean lunar radius the polar maps are projected on (SRC-049), metres. */
export const POLAR_RADIUS_M = 1_737_400;

/** The grid's description, as the offline script writes it (version 1). */
export interface ElevationManifest {
  version: 1;
  /** The binary next to it, in public/data/elevation/. */
  file: string;
  format: 'float32-le';
  width: number;
  height: number;
  /** Grid spacing on the projection plane, metres. */
  pixelSizeM: number;
  /** The centre of the top-left grid cell on the projection plane, metres (x east-ish, y up). */
  originX: number;
  originY: number;
  projection: {
    kind: 'polar-stereographic-south';
    radiusM: number;
    centralLonDeg: number;
    scale: number;
  };
  heights: { unit: 'm'; reference: string };
  /** The grid covers the pole out to this latitude. */
  maxLatDeg: number;
  source: { id: string; title: string; file: string; nativePixelM: number };
}

export interface ElevationGrid {
  manifest: ElevationManifest;
  /** Row-major heights in metres, row 0 at the top (largest y); NaN marks a gap. */
  heights: Float32Array;
}

export type ElevationAtPoint =
  { kind: 'outside' } | { kind: 'gap' } | { kind: 'ok'; heightM: number; slopeDeg: number | null };

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The description, if it is exactly what the app can use; otherwise null (nothing is shown). */
export function readElevationManifest(value: unknown): ElevationManifest | null {
  if (!isRecord(value)) return null;
  const { projection, heights, source } = value;
  if (!isRecord(projection) || !isRecord(heights) || !isRecord(source)) return null;
  const ok =
    value.version === 1 &&
    isText(value.file) &&
    /^[\w.-]+$/.test(value.file) &&
    value.format === 'float32-le' &&
    Number.isInteger(value.width) &&
    Number.isInteger(value.height) &&
    (value.width as number) >= 3 &&
    (value.height as number) >= 3 &&
    isNumber(value.pixelSizeM) &&
    value.pixelSizeM > 0 &&
    isNumber(value.originX) &&
    isNumber(value.originY) &&
    isNumber(value.maxLatDeg) &&
    value.maxLatDeg > -90 &&
    value.maxLatDeg < 0 &&
    projection.kind === 'polar-stereographic-south' &&
    projection.radiusM === POLAR_RADIUS_M &&
    projection.centralLonDeg === 0 &&
    projection.scale === 1 &&
    heights.unit === 'm' &&
    isText(heights.reference) &&
    isText(source.id) &&
    /^SRC-\d{3}$/.test(source.id) &&
    isText(source.title) &&
    isText(source.file) &&
    isNumber(source.nativePixelM) &&
    source.nativePixelM > 0;
  return ok ? (value as unknown as ElevationManifest) : null;
}

const DEG = Math.PI / 180;

/** A point on the south polar stereographic plane: x = ρ sin(lon), y = ρ cos(lon), metres. */
export function toPolarXY(
  { lat, lon }: LatLon,
  radiusM = POLAR_RADIUS_M,
): { x: number; y: number } {
  const rho = 2 * radiusM * Math.tan(Math.PI / 4 + (lat * DEG) / 2);
  return { x: rho * Math.sin(lon * DEG), y: rho * Math.cos(lon * DEG) };
}

/** The projection's scale at a latitude (1 at the pole): grid metres per ground metre. */
export function polarScale(latDeg: number): number {
  return 2 / (1 + Math.sin(Math.abs(latDeg) * DEG));
}

/** A grid position in cells (column from the left, row from the top), not rounded. */
function cellOf(manifest: ElevationManifest, x: number, y: number) {
  return {
    col: (x - manifest.originX) / manifest.pixelSizeM,
    row: (manifest.originY - y) / manifest.pixelSizeM,
  };
}

function at(grid: ElevationGrid, col: number, row: number): number {
  const { width, height } = grid.manifest;
  if (col < 0 || row < 0 || col >= width || row >= height) return Number.NaN;
  return grid.heights[row * width + col] ?? Number.NaN;
}

/**
 * Horn's slope (degrees) at a grid cell, over the eight cells around it; null at the edge or next
 * to a gap. `groundSpacingM` is the true distance between neighbouring cells on the ground.
 */
export function hornSlopeDeg(
  grid: ElevationGrid,
  col: number,
  row: number,
  groundSpacingM: number,
): number | null {
  const z = (dc: number, dr: number) => at(grid, col + dc, row + dr);
  const [a, b, c] = [z(-1, -1), z(0, -1), z(1, -1)];
  const [d, f] = [z(-1, 0), z(1, 0)];
  const [g, h, i] = [z(-1, 1), z(0, 1), z(1, 1)];
  if ([a, b, c, d, f, g, h, i].some((value) => Number.isNaN(value))) return null;
  const dzdx = (c + 2 * f + i - (a + 2 * d + g)) / (8 * groundSpacingM);
  const dzdy = (g + 2 * h + i - (a + 2 * b + c)) / (8 * groundSpacingM);
  return Math.atan(Math.hypot(dzdx, dzdy)) / DEG;
}

/** The grid's height and slope at a point; "outside" past the covered area, "gap" on no data. */
export function elevationAt(grid: ElevationGrid, point: LatLon): ElevationAtPoint {
  const { manifest } = grid;
  if (point.lat > manifest.maxLatDeg) return { kind: 'outside' };
  const { x, y } = toPolarXY(point, manifest.projection.radiusM);
  const { col, row } = cellOf(manifest, x, y);
  if (col < 0 || row < 0 || col > manifest.width - 1 || row > manifest.height - 1) {
    return { kind: 'outside' };
  }
  // Bilinear between the four nearest heights.
  const c0 = Math.min(Math.floor(col), manifest.width - 2);
  const r0 = Math.min(Math.floor(row), manifest.height - 2);
  const fc = col - c0;
  const fr = row - r0;
  const top = at(grid, c0, r0) * (1 - fc) + at(grid, c0 + 1, r0) * fc;
  const bottom = at(grid, c0, r0 + 1) * (1 - fc) + at(grid, c0 + 1, r0 + 1) * fc;
  const heightM = top * (1 - fr) + bottom * fr;
  if (Number.isNaN(heightM)) return { kind: 'gap' };
  const spacing = manifest.pixelSizeM / polarScale(point.lat);
  const slopeDeg = hornSlopeDeg(grid, Math.round(col), Math.round(row), spacing);
  return { kind: 'ok', heightM, slopeDeg };
}

/** "Elevation −1,234 m · Slope 3.4°". */
export function formatElevation(result: Extract<ElevationAtPoint, { kind: 'ok' }>): string {
  const height = `${Math.round(result.heightM).toLocaleString('en-GB')} m`;
  const slope = result.slopeDeg === null ? 'no slope here' : `Slope ${result.slopeDeg.toFixed(1)}°`;
  return `Elevation ${height} · ${slope}`;
}

// ---------- Map layers: the grid redrawn on a longitude-latitude image for the globe ----------

export type ElevationLayer = 'elevation' | 'slope';

/** Slope colours: a continuous scale (dark blue to pale yellow), never pass/fail colours. */
export const SLOPE_SCALE_MAX_DEG = 30;
const SLOPE_STOPS: readonly (readonly [number, number, number])[] = [
  [24, 32, 92],
  [36, 140, 150],
  [242, 228, 120],
];

function ramp(t: number): [number, number, number] {
  const clamped = Math.min(1, Math.max(0, t)) * (SLOPE_STOPS.length - 1);
  const index = Math.min(Math.floor(clamped), SLOPE_STOPS.length - 2);
  const f = clamped - index;
  const from = SLOPE_STOPS[index] ?? [0, 0, 0];
  const to = SLOPE_STOPS[index + 1] ?? from;
  return [0, 1, 2].map((k) => Math.round((from[k] ?? 0) * (1 - f) + (to[k] ?? 0) * f)) as [
    number,
    number,
    number,
  ];
}

/**
 * The grid as an RGBA image covering longitude −180…180 and latitude −90…`maxLatDeg` (row 0 at
 * the north edge), for a single-image map layer. Gaps and cells outside the grid are transparent.
 * Elevation is grey from the lowest to the highest height; slope uses the continuous scale.
 */
export function layerPixels(
  grid: ElevationGrid,
  layer: ElevationLayer,
  width: number,
  height: number,
): Uint8ClampedArray<ArrayBuffer> {
  const { manifest } = grid;
  let low = Infinity;
  let high = -Infinity;
  if (layer === 'elevation') {
    for (const value of grid.heights) {
      if (Number.isNaN(value)) continue;
      low = Math.min(low, value);
      high = Math.max(high, value);
    }
  }
  const span = high - low || 1;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let j = 0; j < height; j++) {
    const lat = manifest.maxLatDeg - ((j + 0.5) * (manifest.maxLatDeg + 90)) / height;
    for (let i = 0; i < width; i++) {
      const lon = -180 + ((i + 0.5) * 360) / width;
      const point = elevationAt(grid, { lat, lon });
      if (point.kind !== 'ok') continue;
      let rgb: [number, number, number];
      if (layer === 'elevation') {
        const grey = Math.round(40 + 200 * ((point.heightM - low) / span));
        rgb = [grey, grey, grey];
      } else {
        if (point.slopeDeg === null) continue;
        rgb = ramp(point.slopeDeg / SLOPE_SCALE_MAX_DEG);
      }
      const o = (j * width + i) * 4;
      pixels[o] = rgb[0];
      pixels[o + 1] = rgb[1];
      pixels[o + 2] = rgb[2];
      pixels[o + 3] = 200;
    }
  }
  return pixels;
}

/** The slope scale's colours, for the legend (CSS colour strings). */
export function slopeScaleColours(): string[] {
  return SLOPE_STOPS.map(([r, g, b]) => `rgb(${r} ${g} ${b})`);
}
