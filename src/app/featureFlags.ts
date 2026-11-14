/**
 * Build-time switches. Each is read from a `VITE_` variable (public in the bundle; never a secret).
 */

/** "on" (any case, spaces ignored) turns a default-off feature on; anything else leaves it off. */
export function enabledWhenOn(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === 'on';
}

/**
 * The "Launch slipped?" assistant in the Mission view: a future plan, off unless
 * VITE_SLIP_ASSISTANT=on. Off, nothing of it renders (the box, its examples, the About guide line
 * and AI notice); the Mission form, the dates and the Delay buttons work without it.
 */
export const SLIP_ASSISTANT_ENABLED: boolean = enabledWhenOn(import.meta.env.VITE_SLIP_ASSISTANT);

/**
 * The Sun visibility and Earth visibility Layers tiles. Off since 2026-11-14 by team decision: only
 * Elevation and Slope show for now, and the Future plans note on the About page says the rest is
 * coming. The code and data stay; set it back to true to show the tiles. Not a build variable:
 * set it here.
 */
export const VISIBILITY_VERIFIED: boolean = false;

/**
 * The terrain horizon (hills hiding the Sun and Earth). OFF since 2026-11-14 by team decision: every
 * point, IM-1 and IM-2 included, uses the flat horizon, and About > Future plans says terrain
 * horizons from LOLA elevation data are coming. The code and src/data/terrainHorizons.ts stay; set
 * it to true to use them again. Not a build variable: set it here.
 */
export const TERRAIN_HORIZON_ENABLED: boolean = false;
