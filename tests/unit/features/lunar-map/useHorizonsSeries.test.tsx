import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useHorizonsSeries } from '../../../../src/features/lunar-map/useHorizonsSeries';
import type { HorizonsSeries } from '../../../../src/services/horizonsData';
import { SITES, type Site } from '../../../../src/services/sites';

/** A made-up, empty series for a site: only its identity matters here. */
const fake = (siteId: string): HorizonsSeries => ({
  siteId,
  startMs: 0,
  stepMs: 600_000,
  count: 0,
  sunAz: new Uint16Array(0),
  sunEl: new Int16Array(0),
  earthAz: new Uint16Array(0),
  earthEl: new Int16Array(0),
});

describe('useHorizonsSeries', () => {
  it('starts empty (the engine), then holds every series that loaded, all at once', async () => {
    const load = vi.fn(async (site: Site) => (site.id === 'bg1' ? null : fake(site.id)));
    const { result } = renderHook(() => useHorizonsSeries(SITES, load));
    expect(result.current.series.size).toBe(0);
    expect(result.current.settled).toBe(false);
    await waitFor(() => expect(result.current.series.size).toBe(3));
    expect([...result.current.series.keys()]).toEqual(['im1', 'im2', 'ch3']);
    expect(result.current.settled).toBe(true);
    expect(load).toHaveBeenCalledTimes(SITES.length);
  });

  it('stays on the engine when nothing loads, even if a load fails', async () => {
    const load = vi.fn(async (site: Site) => {
      if (site.id === 'im1') throw new Error('offline');
      return null;
    });
    const { result } = renderHook(() => useHorizonsSeries(SITES, load));
    // Settled with nothing: the app then says the files didn't load.
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(result.current.series.size).toBe(0);
  });
});
