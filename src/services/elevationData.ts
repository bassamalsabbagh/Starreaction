/**
 * Loads the south-pole elevation grid made by scripts/data/elevation_grid.py (docs/ELEVATION_DATA.md):
 * its description in src/data/elevation/southPole.json, its heights in
 * public/data/elevation/<file>. Both are optional. With no description the app says "No elevation
 * data loaded yet" and fetches nothing.
 */
import {
  readElevationManifest,
  type ElevationGrid,
  type ElevationManifest,
} from '../utils/elevationGrid';

const found = import.meta.glob<unknown>('../data/elevation/southPole.json', {
  eager: true,
  import: 'default',
});

/** The checked description, or null when there is none (or it is not one the app can use). */
export const ELEVATION_MANIFEST: ElevationManifest | null = readElevationManifest(
  Object.values(found)[0],
);

const loads = new WeakMap<ElevationManifest, Promise<ElevationGrid | null>>();

/** Little-endian float32 heights, whatever the machine's own byte order. */
function readHeights(buffer: ArrayBuffer): Float32Array {
  const littleEndian = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
  if (littleEndian) return new Float32Array(buffer);
  const view = new DataView(buffer);
  const heights = new Float32Array(buffer.byteLength / 4);
  for (let i = 0; i < heights.length; i++) heights[i] = view.getFloat32(i * 4, true);
  return heights;
}

/**
 * The grid's heights, fetched once per description. Null when there is no description, the file
 * is missing, or its size doesn't match the description (nothing half-loaded is ever shown).
 */
export function loadElevationGrid(
  manifest: ElevationManifest | null = ELEVATION_MANIFEST,
  fetchImpl: typeof fetch = fetch,
): Promise<ElevationGrid | null> {
  if (!manifest) return Promise.resolve(null);
  let load = loads.get(manifest);
  if (!load) {
    load = (async () => {
      try {
        const response = await fetchImpl(
          `${import.meta.env.BASE_URL}data/elevation/${manifest.file}`,
        );
        if (!response.ok) return null;
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength !== manifest.width * manifest.height * 4) return null;
        return { manifest, heights: readHeights(buffer) };
      } catch {
        return null;
      }
    })();
    loads.set(manifest, load);
  }
  return load;
}
