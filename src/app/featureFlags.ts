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
 * The visibility prototype's Layers tile: shown only once its browser verification has passed
 * (on since 2026-11-14 by team decision: Sun and Earth visibility are layers, no longer labelled
 * a prototype). Not a build variable: set it here.
 */
export const VISIBILITY_VERIFIED: boolean = true;
