/**
 * The visibility overlays' display colours (src/data/visibility/palette.json; docs/LANDER_RULES.md,
 * "Visibility prototype layer", Display): the same palette and transparency the PNGs were drawn
 * with, for the legends. Display only: values are never read from colours. Pure.
 */
import palette from '../../data/visibility/palette.json';
import type { VisibilityTarget } from './visibilityLayer';

export interface PaletteStop {
  readonly value: number;
  readonly color: string;
}

export const VISIBILITY_PALETTE: Readonly<Record<VisibilityTarget, readonly PaletteStop[]>> = {
  sun: palette.sun.stops,
  earth: palette.earth.stops,
};

/** 0 is fully transparent; above it, opacity rises linearly from `min` to `max` at 1. */
export function paletteAlpha(value: number): number {
  if (value <= 0) return palette.alpha.zero;
  const v = Math.min(1, value);
  return palette.alpha.min + (palette.alpha.max - palette.alpha.min) * v;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The palette colour at a value (linear between stops), as [r, g, b]. */
export function paletteRgb(stops: readonly PaletteStop[], value: number): [number, number, number] {
  const first = stops[0];
  if (!first) return [0, 0, 0];
  let lower = first;
  for (const stop of stops) {
    if (stop.value >= value) {
      const span = stop.value - lower.value;
      const t = span > 0 ? (value - lower.value) / span : 0;
      const a = hexToRgb(lower.color);
      const b = hexToRgb(stop.color);
      const mix = (i: 0 | 1 | 2) => Math.round(a[i] + (b[i] - a[i]) * t);
      return [mix(0), mix(1), mix(2)];
    }
    lower = stop;
  }
  return hexToRgb(lower.color);
}

/** The smallest non-zero value the frames hold (1/128 steps): where the colour starts. */
const FIRST_STEP = 1 / 128;

/**
 * A left-to-right CSS gradient for a 0–100 % legend: transparent at 0, then each palette stop with
 * its own opacity, so the bar shows both the colour and the transparency.
 */
export function paletteGradient(stops: readonly PaletteStop[]): string {
  const at = (value: number) => {
    const [r, g, b] = paletteRgb(stops, value);
    const alpha = Number(paletteAlpha(value).toFixed(3));
    return `rgba(${r}, ${g}, ${b}, ${alpha}) ${(value * 100).toFixed(2)}%`;
  };
  const values = [0, FIRST_STEP, ...stops.map((stop) => stop.value).filter((v) => v > FIRST_STEP)];
  // The step from transparent to the first colour is sharp, as on the map.
  const [r0, g0, b0] = paletteRgb(stops, 0);
  const transparentEdge = `rgba(${r0}, ${g0}, ${b0}, 0) ${(FIRST_STEP * 100).toFixed(2)}%`;
  const parts = values.map(at);
  parts.splice(1, 0, transparentEdge);
  return `linear-gradient(to right, ${parts.join(', ')})`;
}
