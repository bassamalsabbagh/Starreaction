// The team's real frames (public/data/visibility-cap, DATA_SOURCES SRC-074), read from disk: the
// vendored sampleVisibility must return the grid's own value for the cell a point falls in. Each
// point is made here from a cell (its polar stereographic x/y turned back into latitude and
// longitude), the opposite way to the helper, so the two are independent.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  sampleVisibility,
  type NumericGrid,
  type VisibilityManifest,
} from '../../../../src/features/lunar-map/visibility/visibility-data.mjs';
import {
  FRAME_FIRST_UTC,
  FRAME_LAST_UTC,
  snapToFrame,
} from '../../../../src/features/lunar-map/visibilityLayer';

const DIR = 'public/data/visibility-cap';
const read = <T>(file: string): T => JSON.parse(readFileSync(`${DIR}/${file}`, 'utf8')) as T;
const HAS_DATA = existsSync(`${DIR}/manifest.json`);

/** Latitude and east longitude (degrees) of a point in a cell; fx, fy 0–1 across it. */
function cellPoint(grid: NumericGrid, row: number, col: number, fx = 0.5, fy = 0.5) {
  const [x0 = 0, dx = 1, , y0 = 0, , dy = -1] = grid.geotransform;
  const x = x0 + (col + fx) * dx;
  const y = y0 + (row + fy) * dy;
  const rho = Math.hypot(x, y);
  const lat = ((2 * Math.atan(rho / (2 * grid.radius_m)) - Math.PI / 2) * 180) / Math.PI;
  const lon = (Math.atan2(x, y) * 180) / Math.PI;
  return { lat, lon };
}

const valueAt = (grid: NumericGrid, row: number, col: number) =>
  grid.values[row * grid.width + col];

/** The first cell, centre well inside 80° S, whose value passes the test. */
function findCell(grid: NumericGrid, test: (value: number) => boolean) {
  for (let row = 0; row < grid.height; row++) {
    for (let col = 0; col < grid.width; col++) {
      const value = valueAt(grid, row, col);
      if (value !== undefined && test(value) && cellPoint(grid, row, col).lat < -80.5) {
        return { row, col, value };
      }
    }
  }
  return null;
}

describe.runIf(HAS_DATA)('visibility frames on disk', () => {
  const manifest = HAS_DATA ? read<VisibilityManifest>('manifest.json') : { frames: [] };

  it('has every 10-minute frame from the first to the last, for the Sun and the Earth', () => {
    const times = [...new Set(manifest.frames.map((frame) => frame.time_utc))].sort();
    expect(times).toHaveLength(2017);
    expect(times[0]).toBe(FRAME_FIRST_UTC);
    expect(times[times.length - 1]).toBe(FRAME_LAST_UTC);
    // The app's snapping lands exactly on the manifest's own stamps.
    for (const time of times) expect(snapToFrame(Date.parse(time))).toBe(time);
    expect(manifest.frames).toHaveLength(4034);
  });

  for (const [target, time] of [
    ['sun', FRAME_FIRST_UTC],
    ['earth', FRAME_FIRST_UTC],
    ['sun', FRAME_LAST_UTC],
    ['earth', FRAME_LAST_UTC],
  ] as const) {
    describe(`${target} at ${time}`, () => {
      const frame = manifest.frames.find(
        (entry) => entry.target === target && entry.time_utc === time,
      );
      const grid = frame ? read<NumericGrid>(frame.numerical) : null;

      it('is a 65 × 65 grid at 9.6 km with NoData −9999', () => {
        expect(grid?.width).toBe(65);
        expect(grid?.height).toBe(65);
        expect(grid?.source_pixel_spacing_m).toBe(9600);
        expect(grid?.nodata).toBe(-9999);
        expect(frame?.rectangle_degrees).toEqual([-180, -90, 180, -80]);
      });

      it('reads the pole cell and cells at each quarter of longitude', () => {
        if (!grid) throw new Error('missing grid');
        for (const [row, col] of [
          [32, 32],
          [10, 32], // towards 0° E
          [32, 54], // towards 90° E
          [54, 32], // towards 180°
          [32, 10], // towards 90° W
          [50, 20],
        ] as const) {
          const point = cellPoint(grid, row, col);
          expect(sampleVisibility(grid, point.lon, point.lat)).toBe(valueAt(grid, row, col));
        }
      });

      it('keeps 0 as a value, and reads a part-visible cell', () => {
        if (!grid) throw new Error('missing grid');
        const zero = findCell(grid, (value) => value === 0);
        expect(zero).not.toBeNull();
        if (zero) {
          const point = cellPoint(grid, zero.row, zero.col, 0.3, 0.7);
          expect(sampleVisibility(grid, point.lon, point.lat)).toBe(0);
        }
        const part = findCell(grid, (value) => value > 0 && value < 1);
        if (part) {
          const point = cellPoint(grid, part.row, part.col);
          expect(sampleVisibility(grid, point.lon, point.lat)).toBe(part.value);
        }
      });

      it('gives null for NoData and north of 80° S', () => {
        if (!grid) throw new Error('missing grid');
        // A corner cell is NoData (and outside the cap).
        expect(valueAt(grid, 0, 0)).toBe(-9999);
        const corner = cellPoint(grid, 0, 0);
        expect(sampleVisibility(grid, corner.lon, corner.lat)).toBeNull();
        // The same real grid with one cap cell set to its NoData value.
        const masked = { ...grid, values: [...grid.values] };
        masked.values[32 * grid.width + 40] = grid.nodata;
        const inside = cellPoint(grid, 32, 40);
        expect(sampleVisibility(masked, inside.lon, inside.lat)).toBeNull();
        // Row 0, column 32 has data (towards 0° E) but reaches past 80° S: only its southern
        // part reads.
        expect(valueAt(grid, 0, 32)).not.toBe(-9999);
        expect(sampleVisibility(grid, 0, -80.05)).toBe(valueAt(grid, 0, 32));
        expect(sampleVisibility(grid, 0, -79.95)).toBeNull();
        expect(sampleVisibility(grid, 0, -70)).toBeNull();
      });
    });
  }

  it('has a different Sun picture at the two ends (the frames follow the time)', () => {
    const first = read<NumericGrid>('sun_20261124T000000Z.json');
    const last = read<NumericGrid>('sun_20261208T000000Z.json');
    expect(valueAt(first, 32, 32)).toBe(1);
    expect(valueAt(last, 32, 32)).toBe(0);
    expect(sampleVisibility(first, 0, -90)).toBe(1);
    expect(sampleVisibility(last, 0, -90)).toBe(0);
  });
});
