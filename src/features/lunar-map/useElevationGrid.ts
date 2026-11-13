import { useEffect, useState } from 'react';
import { ELEVATION_MANIFEST, loadElevationGrid } from '../../services/elevationData';
import type { ElevationGrid, ElevationManifest } from '../../utils/elevationGrid';

/** Where the south-pole elevation data stands: none loaded, on its way, ready, or failed. */
export type ElevationState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; grid: ElevationGrid };

/** Loads the elevation grid once, if a description exists (docs/ELEVATION_DATA.md). */
export function useElevationGrid(
  manifest: ElevationManifest | null = ELEVATION_MANIFEST,
): ElevationState {
  const [state, setState] = useState<ElevationState>(
    manifest ? { status: 'loading' } : { status: 'none' },
  );
  useEffect(() => {
    if (!manifest) return undefined;
    let live = true;
    void loadElevationGrid(manifest).then((grid) => {
      if (live) setState(grid ? { status: 'ready', grid } : { status: 'failed' });
    });
    return () => {
      live = false;
    };
  }, [manifest]);
  return state;
}
