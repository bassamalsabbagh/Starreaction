/** What a shared link carries: enough to open the same view. */
export interface ShareState {
  missionId: string;
  siteId: string | null;
  /** A point checked anywhere on the Moon (degrees), instead of a site. */
  point?: { lat: number; lon: number } | null;
  /** The exact app time (UTC ms); the receiver opens it as simulated time at that moment. */
  time: number;
}

/** "#mission=demo-mission-a&site=demo-site-alpha&t=2026-11-15T02:00:00.000Z" (or "at=lat,lon" for a point). */
export function shareHash(state: ShareState): string {
  const params = new URLSearchParams();
  params.set('mission', state.missionId);
  if (state.siteId) params.set('site', state.siteId);
  if (state.point) params.set('at', `${state.point.lat.toFixed(2)},${state.point.lon.toFixed(2)}`);
  params.set('t', new Date(state.time).toISOString());
  return `#${params.toString()}`;
}

/**
 * Reads a shared link's hash back. Only known missions and sites, a point within range and a valid time are kept;
 * anything else is left out, so the app falls back to its defaults for it.
 */
export function readShareHash(
  hash: string,
  known: { missionIds: readonly string[]; siteIds: readonly string[] },
): Partial<ShareState> {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const result: Partial<ShareState> = {};
  const mission = params.get('mission');
  if (mission && known.missionIds.includes(mission)) result.missionId = mission;
  const site = params.get('site');
  if (site && known.siteIds.includes(site)) result.siteId = site;
  const at = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(params.get('at') ?? '');
  if (at) {
    const lat = Number(at[1]);
    const lon = Number(at[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) result.point = { lat, lon };
  }
  const time = Date.parse(params.get('t') ?? '');
  if (Number.isFinite(time)) result.time = time;
  return result;
}
