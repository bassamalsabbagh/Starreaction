import { useEffect, useState } from 'react';
import { loadHorizonsSeries, type HorizonsSeries } from '../../services/horizonsData';
import { SITES, type Site } from '../../services/sites';

export interface HorizonsLoad {
  /** The series that loaded, by site id (empty until they arrive). */
  readonly series: ReadonlyMap<string, HorizonsSeries>;
  /** Every load has finished, so a site without a series has none (its file didn't load). */
  readonly settled: boolean;
}

const START: HorizonsLoad = { series: new Map(), settled: false };

/**
 * The fixed sites' JPL Horizons series, by site id, loaded once at start. Empty until they arrive
 * (the app uses its engine meanwhile), then every series that loaded, all at once, so the checks
 * are worked out again once. A site without a file stays on the engine.
 */
export function useHorizonsSeries(
  sites: readonly Site[] = SITES,
  load: (site: Site) => Promise<HorizonsSeries | null> = loadHorizonsSeries,
): HorizonsLoad {
  const [state, setState] = useState(START);
  useEffect(() => {
    let live = true;
    void Promise.all(
      sites.map(async (site) => {
        try {
          return [site.id, await load(site)] as const;
        } catch {
          return [site.id, null] as const;
        }
      }),
    ).then((entries) => {
      const found = new Map<string, HorizonsSeries>();
      for (const [id, entry] of entries) if (entry) found.set(id, entry);
      if (live) setState({ series: found, settled: true });
    });
    return () => {
      live = false;
    };
  }, [sites, load]);
  return state;
}
