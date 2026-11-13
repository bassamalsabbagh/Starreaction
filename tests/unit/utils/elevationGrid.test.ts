import { describe, expect, it } from 'vitest';
import {
  POLAR_RADIUS_M,
  elevationAt,
  formatElevation,
  layerPixels,
  polarScale,
  readElevationManifest,
  toPolarXY,
  type ElevationGrid,
  type ElevationManifest,
} from '../../../src/utils/elevationGrid';

// Every grid here is MADE UP inside the tests (a flat plane, a tilted plane, a bowl). None is real
// data, none is shown in the app, and none is saved as a file.

const R = POLAR_RADIUS_M;
const DEG = Math.PI / 180;

/** The point on the Moon at a spot on the polar plane (the inverse of toPolarXY). */
function latLonOf(x: number, y: number) {
  const rho = Math.hypot(x, y);
  return { lat: (2 * Math.atan(rho / (2 * R))) / DEG - 90, lon: Math.atan2(x, y) / DEG };
}

/** A made-up grid centred on the pole, `size` × `size` cells of `pixel` metres, heights z(x, y). */
function fakeGrid(size: number, pixel: number, z: (x: number, y: number) => number): ElevationGrid {
  const half = ((size - 1) / 2) * pixel;
  const manifest: ElevationManifest = {
    version: 1,
    file: 'test-only.f32',
    format: 'float32-le',
    width: size,
    height: size,
    pixelSizeM: pixel,
    originX: -half,
    originY: half,
    projection: { kind: 'polar-stereographic-south', radiusM: R, centralLonDeg: 0, scale: 1 },
    heights: { unit: 'm', reference: 'sphere 1737400 m' },
    // Inside the grid's inscribed circle.
    maxLatDeg: latLonOf(half * 0.95, 0).lat,
    source: { id: 'SRC-999', title: 'Made-up test grid', file: 'none', nativePixelM: pixel },
  };
  const heights = new Float32Array(size * size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      heights[row * size + col] = z(-half + col * pixel, half - row * pixel);
    }
  }
  return { manifest, heights };
}

describe('toPolarXY (south polar stereographic on the 1737.4 km sphere)', () => {
  it('puts the pole at the origin and 80° S at 2R·tan(5°), longitude 0 up and 90° E right', () => {
    const rho80 = 2 * R * Math.tan(5 * DEG);
    expect(toPolarXY({ lat: -90, lon: 0 }).x).toBeCloseTo(0, 6);
    expect(toPolarXY({ lat: -90, lon: 0 }).y).toBeCloseTo(0, 6);
    const up = toPolarXY({ lat: -80, lon: 0 });
    expect(up.x).toBeCloseTo(0, 6);
    expect(up.y).toBeCloseTo(rho80, 3);
    const right = toPolarXY({ lat: -80, lon: 90 });
    expect(right.x).toBeCloseTo(rho80, 3);
    expect(right.y).toBeCloseTo(0, 3);
    expect(toPolarXY({ lat: -80, lon: 180 }).y).toBeCloseTo(-rho80, 3);
    // 80° S is 304 km from the pole on the plane, as the PGDA maps say (± 304 km).
    expect(Math.round(rho80 / 1000)).toBe(304);
  });

  it('round-trips with the inverse used in these tests', () => {
    const point = { lat: -86.25, lon: 47.5 };
    const { x, y } = toPolarXY(point);
    const back = latLonOf(x, y);
    expect(back.lat).toBeCloseTo(point.lat, 9);
    expect(back.lon).toBeCloseTo(point.lon, 9);
  });

  it('has scale 1 at the pole, growing away from it', () => {
    expect(polarScale(-90)).toBeCloseTo(1, 12);
    expect(polarScale(-80)).toBeCloseTo(2 / (1 + Math.sin(80 * DEG)), 12);
  });
});

describe('elevationAt on made-up grids', () => {
  it('a flat plane: the same height everywhere and no slope', () => {
    const grid = fakeGrid(41, 1000, () => -1500);
    for (const point of [
      { lat: -90, lon: 0 },
      { lat: -89.6, lon: 120 },
      { lat: -89.8, lon: -45 },
    ]) {
      const result = elevationAt(grid, point);
      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') continue;
      expect(result.heightM).toBeCloseTo(-1500, 6);
      expect(result.slopeDeg).toBeCloseTo(0, 9);
    }
  });

  it('a tilted plane: height read exactly, slope atan(gradient × projection scale)', () => {
    // 201 cells of 500 m: the grid reaches about 88.4° S.
    const grid = fakeGrid(201, 500, (x) => 0.1 * x);
    const point = { lat: -89, lon: 30 };
    const result = elevationAt(grid, point);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.heightM).toBeCloseTo(0.1 * toPolarXY(point).x, 3);
    expect(result.slopeDeg).toBeCloseTo(Math.atan(0.1 * polarScale(point.lat)) / DEG, 9);
    // At the pole the scale is 1: atan(0.1) = 5.71°.
    const pole = elevationAt(grid, { lat: -90, lon: 0 });
    expect(pole.kind === 'ok' && pole.slopeDeg).toBeCloseTo(5.710593, 5);
  });

  it('a bowl: deepest and flat in the middle, steeper away from it (Horn is exact here)', () => {
    const bowlRadius = 50_000;
    const grid = fakeGrid(101, 400, (x, y) => (x * x + y * y) / (2 * bowlRadius));
    const centre = elevationAt(grid, { lat: -90, lon: 0 });
    expect(centre.kind === 'ok' && centre.heightM).toBeCloseTo(0, 6);
    expect(centre.kind === 'ok' && centre.slopeDeg).toBeCloseTo(0, 9);
    // A cell centre 30 cells east: on a paraboloid the slope there is atan(r / bowlRadius).
    const x = 30 * 400;
    const point = latLonOf(x, 0);
    const side = elevationAt(grid, point);
    expect(side.kind).toBe('ok');
    if (side.kind !== 'ok') return;
    expect(side.heightM).toBeCloseTo((x * x) / (2 * bowlRadius), 3);
    expect(side.slopeDeg).toBeCloseTo(Math.atan((x / bowlRadius) * polarScale(point.lat)) / DEG, 6);
  });

  it('says "outside" past the covered latitude and "gap" on missing heights', () => {
    const grid = fakeGrid(21, 1000, () => 0);
    expect(elevationAt(grid, { lat: -45, lon: 0 })).toEqual({ kind: 'outside' });
    grid.heights.fill(Number.NaN);
    expect(elevationAt(grid, { lat: -90, lon: 0 })).toEqual({ kind: 'gap' });
  });

  it('has no slope next to a gap, but still a height', () => {
    const grid = fakeGrid(21, 1000, () => 100);
    // The point is the cell centre at row 11 (1 km below the pole on the plane); the cell just
    // above it (row 10, the pole's) is missing. Horn needs all eight neighbours.
    grid.heights[10 * 21 + 10] = Number.NaN;
    const result = elevationAt(grid, latLonOf(0, -1000));
    expect(result).toEqual({ kind: 'ok', heightM: 100, slopeDeg: null });
  });

  it('formats the fact line', () => {
    expect(formatElevation({ kind: 'ok', heightM: -1234.4, slopeDeg: 3.44 })).toBe(
      'Elevation -1,234 m · Slope 3.4°',
    );
    expect(formatElevation({ kind: 'ok', heightM: 12, slopeDeg: null })).toBe(
      'Elevation 12 m · no slope here',
    );
  });
});

describe('readElevationManifest', () => {
  const good = fakeGrid(5, 100, () => 0).manifest;

  it('accepts the description the script writes', () => {
    expect(readElevationManifest(JSON.parse(JSON.stringify(good)))).toEqual(good);
  });

  it.each([
    ['another projection', { ...good, projection: { ...good.projection, kind: 'mercator' } }],
    ['another radius', { ...good, projection: { ...good.projection, radiusM: 1_738_100 } }],
    ['heights in feet', { ...good, heights: { unit: 'ft', reference: 'x' } }],
    ['no source id', { ...good, source: { ...good.source, id: '' } }],
    ['a path in the file name', { ...good, file: '../secret.bin' }],
    ['16-bit heights', { ...good, format: 'int16-le' }],
    ['a covered area past the equator', { ...good, maxLatDeg: 10 }],
  ])('refuses %s', (_label, value) => {
    expect(readElevationManifest(value)).toBeNull();
  });
});

describe('layerPixels (the map layers)', () => {
  it('draws the covered area and leaves the rest clear', () => {
    const grid = fakeGrid(41, 1000, (x) => 0.05 * x);
    const width = 64;
    const height = 8;
    const pixels = layerPixels(grid, 'slope', width, height);
    expect(pixels).toHaveLength(width * height * 4);
    const alphas = new Set<number>();
    for (let i = 3; i < pixels.length; i += 4) alphas.add(pixels[i] ?? -1);
    // Some cells drawn, some clear (the image's corners lie beyond the made-up grid).
    expect(alphas.has(200)).toBe(true);
  });

  it('gives a tilted plane one slope colour everywhere it draws', () => {
    const grid = fakeGrid(201, 500, (x) => 0.1 * x);
    const pixels = layerPixels(grid, 'slope', 32, 4);
    const colours = new Set<string>();
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] === 200) colours.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
    }
    // One gradient, so one colour, give or take the projection scale across the area.
    expect(colours.size).toBeLessThanOrEqual(3);
    expect(colours.size).toBeGreaterThan(0);
  });
});
