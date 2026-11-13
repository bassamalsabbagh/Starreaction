// Standalone data helper. No website files are modified by this package.
export function sampleVisibility(grid, longitudeEastDegrees, latitudeDegrees) {
  if (!Number.isFinite(longitudeEastDegrees) || !Number.isFinite(latitudeDegrees) ||
      latitudeDegrees < -90 || latitudeDegrees > -80) return null;
  const lat = latitudeDegrees * Math.PI / 180;
  const lon = longitudeEastDegrees * Math.PI / 180;
  const rho = 2 * grid.radius_m * Math.tan(Math.PI / 4 + lat / 2);
  const x = rho * Math.sin(lon), y = rho * Math.cos(lon);
  const t = grid.geotransform;
  if (t[2] !== 0 || t[4] !== 0) throw new Error('Rotated grid not supported');
  const col = Math.floor((x - t[0]) / t[1]);
  const row = Math.floor((y - t[3]) / t[5]);
  if (col < 0 || row < 0 || col >= grid.width || row >= grid.height) return null;
  const value = grid.values[row * grid.width + col];
  return Number.isFinite(value) && value !== grid.nodata ? value : null;
}

export async function loadVisibilityFrame(baseUrl, manifest, target, timeUTC, signal) {
  const frame = manifest.frames.find(f => f.target === target && f.time_utc === timeUTC);
  if (!frame) throw new Error('Unsupported timestamp or target; no interpolation available');
  const base = new URL(baseUrl, globalThis.location?.href ?? 'http://localhost/');
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  const response = await fetch(new URL(frame.numerical, base), { signal });
  if (!response.ok) throw new Error(`Numerical grid request failed: ${response.status}`);
  return { frame, grid: await response.json(), imageUrl: new URL(frame.image, base).href };
}
