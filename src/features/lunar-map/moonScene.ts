/**
 * Pure helpers for the Cesium Moon scene: no Cesium import, so they are unit-testable in jsdom.
 * Colours are taken from the design tokens at runtime, so the scene follows global.css.
 */

export const GRID_STEP_DEG = 30;

/** Latitudes of the graticule's parallels (the poles are points, so they are skipped). */
export const GRID_LATITUDES: readonly number[] = range(-90 + GRID_STEP_DEG, 90 - GRID_STEP_DEG);

/** Longitudes of the graticule's meridians, −180 to 150 (180 is the same line as −180). */
export const GRID_LONGITUDES: readonly number[] = range(-180, 180 - GRID_STEP_DEG);

function range(from: number, to: number): number[] {
  const values: number[] = [];
  for (let value = from; value <= to; value += GRID_STEP_DEG) values.push(value);
  return values;
}

/** Points along a parallel, dense enough to stay smooth on the globe: [lon, lat, lon, lat, …]. */
export function parallelDegrees(lat: number, stepDeg = 5): number[] {
  const flat: number[] = [];
  for (let lon = -180; lon <= 180; lon += stepDeg) flat.push(lon, lat);
  return flat;
}

/** Points along a meridian from pole to pole: [lon, lat, lon, lat, …]. */
export function meridianDegrees(lon: number, stepDeg = 5): number[] {
  const flat: number[] = [];
  for (let lat = -90; lat <= 90; lat += stepDeg) flat.push(lon, lat);
  return flat;
}

export interface BeaconStyle {
  /** Score colour (or the grey for unsuitable sites). */
  fill: string;
  /** Dark ink for the rank number and the dot's rim. */
  ink: string;
  /** Set when the site is in the compare set: the colour of its badge. */
  compareBadge?: string;
}

/** A beacon's drawn size in CSS pixels before distance scaling; its image is drawn at 2×. */
export const BEACON_SIZE_PX = 40;

/**
 * Beacons shrink with distance between these two points (linear in between, clamped outside), so
 * they never drop below 32px, the minimum click target, and never cover a close-up.
 */
export const BEACON_SCALE = { nearM: 150_000, near: 1.15, farM: 6_000_000, far: 0.8 } as const;

/** The beacon scale at a camera distance, as Cesium's scaleByDistance computes it. */
export function beaconScaleAt(distanceM: number): number {
  const { nearM, near, farM, far } = BEACON_SCALE;
  const t = Math.min(1, Math.max(0, (distanceM - nearM) / (farM - nearM)));
  return near + (far - near) * t;
}

/**
 * A flat, glowing beacon as an SVG data URI: a soft halo in the score colour, a solid dot with a
 * dark rim, and the rank inside. Unsuitable sites (no rank) are a small grey dot with no number.
 * Every beacon keeps a faint halo out to its full size, so the whole 40px stays clickable (Cesium
 * ignores near-transparent pixels when picking). Colour is never the only signal: the number, the
 * list and the hover text carry the same rating.
 */
export function beaconSvgDataUri(
  { fill, ink, compareBadge }: BeaconStyle,
  rank: number | null,
): string {
  const size = BEACON_SIZE_PX;
  const c = size / 2;
  const halo =
    `<defs><radialGradient id="g"><stop offset="0.35" stop-color="${fill}" stop-opacity="${rank === null ? 0.25 : 0.55}"/>` +
    `<stop offset="1" stop-color="${fill}" stop-opacity="0.04"/></radialGradient></defs>` +
    `<circle cx="${c}" cy="${c}" r="${c}" fill="url(#g)"/>`;
  const body =
    rank === null
      ? `<circle cx="${c}" cy="${c}" r="4.5" fill="${fill}" stroke="${ink}" stroke-width="1.5"/>`
      : `<circle cx="${c}" cy="${c}" r="10.5" fill="${fill}" stroke="${ink}" stroke-width="1.5"/>` +
        `<text x="${c}" y="${c + 4}" text-anchor="middle" font-family="Segoe UI, system-ui, Arial, sans-serif" ` +
        `font-size="12" font-weight="700" fill="${ink}">${rank}</text>`;
  // In the compare set: a small badge on the dot's upper right with a tick, so it reads without
  // colour too.
  const reach = rank === null ? 4 : 8.5;
  const bx = c + reach;
  const by = c - reach;
  const badge = compareBadge
    ? `<circle cx="${bx}" cy="${by}" r="5.5" fill="${compareBadge}" stroke="${ink}" stroke-width="1.25"/>` +
      `<path d="M${bx - 2.5} ${by + 0.2} l1.7 1.7 3.1-3.4" fill="none" stroke="${ink}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`
    : '';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size * 2}" height="${size * 2}" viewBox="0 0 ${size} ${size}">` +
    halo +
    body +
    badge +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Selected beacons are larger, and hovered ones grow a little more. */
export function beaconScale(selected: boolean, hovered: boolean): number {
  return (selected ? 1.2 : 1) * (hovered ? 1.12 : 1);
}

type Vec3 = readonly [number, number, number];

/** Where the rim fade ends for the selected site: it stays fully drawn almost to the rim. */
export const SELECTED_FULL_FROM = 0.05;

/**
 * How visible a surface point is from the camera: 1 when the camera is well above its horizon,
 * fading to 0 as the point nears the rim, 0 on the far side. `point` and `camera` are positions
 * from the Moon's centre (a sphere is close enough for a fade). `fullFrom` is the cosine (between
 * the point's up and its view of the camera) from which it is fully drawn.
 */
export function horizonAlpha(point: Vec3, camera: Vec3, fullFrom = 0.2): number {
  const [px, py, pz] = point;
  const length = Math.hypot(px, py, pz) || 1;
  const toCamera: Vec3 = [camera[0] - px, camera[1] - py, camera[2] - pz];
  const distance = Math.hypot(...toCamera) || 1;
  const cosine = (px * toCamera[0] + py * toCamera[1] + pz * toCamera[2]) / (length * distance);
  const t = Math.min(1, Math.max(0, (cosine - 0.02) / (fullFrom - 0.02)));
  return t * t * (3 - 2 * t);
}

/** Height above the surface for a zoom step, kept inside the camera's limits. */
export function steppedHeight(current: number, factor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, current * factor));
}

/** Reads a CSS custom property from :root, with a fallback for non-browser environments. */
export function cssToken(name: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof getComputedStyle === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  );
}
