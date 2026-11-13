/** What a shared link carries: enough to open the same view. */
export interface ShareState {
  missionId: string;
  siteId: string | null;
  /** A point checked anywhere on the Moon (degrees), instead of a site. */
  point?: { lat: number; lon: number } | null;
  /** The exact app time (UTC ms); the receiver opens it as simulated time at that moment. */
  time: number;
  /** Dates picked in the Mission view (each 00:00 UTC), when the checks use them. */
  dates?: { startMs: number; stopMs: number } | null;
}

/** "2026-12-12" (UTC). */
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** 00:00 UTC on a real "YYYY-MM-DD" date, or null. */
function readDay(text: string | null): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text ?? '');
  if (!match) return null;
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const ms = Date.UTC(year, month - 1, date);
  const check = new Date(ms);
  return check.getUTCMonth() === month - 1 && check.getUTCDate() === date ? ms : null;
}

/** "#mission=demo-mission-a&site=demo-site-alpha&t=2026-11-15T02:00:00.000Z" (or "at=lat,lon" for a point). */
export function shareHash(state: ShareState): string {
  const params = new URLSearchParams();
  params.set('mission', state.missionId);
  if (state.siteId) params.set('site', state.siteId);
  if (state.point) params.set('at', `${state.point.lat.toFixed(2)},${state.point.lon.toFixed(2)}`);
  if (state.dates) {
    params.set('from', day(state.dates.startMs));
    params.set('to', day(state.dates.stopMs));
  }
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
  const startMs = readDay(params.get('from'));
  const stopMs = readDay(params.get('to'));
  if (startMs !== null && stopMs !== null && stopMs >= startMs) result.dates = { startMs, stopMs };
  const time = Date.parse(params.get('t') ?? '');
  if (Number.isFinite(time)) result.time = time;
  return result;
}
