/**
 * The team's visibility prototype layer (docs/LANDER_RULES.md, "Visibility prototype layer (agreed
 * 2026-11-13)"; DATA_SOURCES SRC-074): which frame the app's time uses, the switches, the words,
 * the readout and the frame loading order. No Cesium import, so it stays testable. It never feeds a
 * check, the ranking or a verdict.
 */
import { DEFAULT_LAYER_OPACITY, type LayerSetting } from './mapLayerState';

export type VisibilityTarget = 'sun' | 'earth';
export const VISIBILITY_TARGETS: readonly VisibilityTarget[] = ['sun', 'earth'];

/** The supplied frames (manifest date_range_utc and interval_minutes), endpoints included. */
export const FRAME_FIRST_UTC = '2026-11-24T00:00:00Z';
export const FRAME_LAST_UTC = '2026-12-08T00:00:00Z';
export const FRAME_STEP_MS = 10 * 60_000;
const FIRST_MS = Date.parse(FRAME_FIRST_UTC);
const LAST_MS = Date.parse(FRAME_LAST_UTC);

export const VISIBILITY_MANIFEST_URL = `${import.meta.env.BASE_URL}data/visibility-cap/manifest.json`;

export const VISIBILITY_SWITCH_LABEL = 'Visibility (prototype)';
export const TARGET_LABELS: Readonly<Record<VisibilityTarget, string>> = {
  sun: 'Sun visibility (prototype)',
  earth: 'Earth visibility (prototype)',
};
export const VISIBILITY_LABEL =
  'Prototype geometric visibility · 9.6 km grid · 2 m assumed height · eclipses not modeled';
export const VISIBILITY_MEANING =
  'Instantaneous geometric disc visibility: not a share of time lit, and not DSN link availability.';
export const NO_FRAME_TEXT = 'No frame for this time (frames: 24 Nov–8 Dec 2026 UTC)';
export const GRID_WORDS = '9.6 km grid';
export const UNAVAILABLE_TEXT = 'Visibility layer unavailable: its data could not be loaded.';

/** "2026-11-24T00:10:00Z": the manifest's own form (whole seconds, explicit Z). */
export function frameStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * The supplied frame nearest the app's time, or null outside the frames' range (no frame is ever
 * made up or interpolated). A time exactly halfway between two frames takes the later one.
 */
export function snapToFrame(ms: number): string | null {
  if (!Number.isFinite(ms) || ms < FIRST_MS || ms > LAST_MS) return null;
  const steps = Math.round((ms - FIRST_MS) / FRAME_STEP_MS);
  return frameStamp(Math.min(LAST_MS, FIRST_MS + steps * FRAME_STEP_MS));
}

/** "2026-11-24 00:10 UTC". */
export function formatFrameTime(stamp: string): string {
  return `${stamp.slice(0, 10)} ${stamp.slice(11, 16)} UTC`;
}

/** The master switch, the one overlay shown (Sun or Earth), and each target's own opacity. */
export interface VisibilitySettings {
  readonly on: boolean;
  /** Switched on at least once: nothing loads before that. */
  readonly started: boolean;
  readonly active: VisibilityTarget;
  readonly opacity: Readonly<Record<VisibilityTarget, number>>;
}

/** One overlay at a time, the Sun first (docs/LANDER_RULES.md, "Display"). */
export const INITIAL_VISIBILITY: VisibilitySettings = {
  on: false,
  started: false,
  active: 'sun',
  opacity: { sun: DEFAULT_LAYER_OPACITY, earth: DEFAULT_LAYER_OPACITY },
};

/** The overlay shown: the active one while the master switch is on, otherwise none. */
export function shownTargets(settings: VisibilitySettings): VisibilityTarget[] {
  return settings.on ? [settings.active] : [];
}

/** What the globe draws: a target is visible only with a frame for the app's time. */
export interface VisibilityDisplay {
  readonly load: boolean;
  readonly frame: string | null;
  readonly sun: LayerSetting;
  readonly earth: LayerSetting;
}

export function visibilityDisplay(
  settings: VisibilitySettings,
  frame: string | null,
): VisibilityDisplay {
  const shown = shownTargets(settings);
  const setting = (target: VisibilityTarget): LayerSetting => ({
    visible: frame !== null && shown.includes(target),
    opacity: settings.opacity[target],
  });
  return { load: settings.started, frame, sun: setting('sun'), earth: setting('earth') };
}

export interface VisibilitySample {
  readonly fraction: number;
  readonly percentage: number;
  readonly timeUTC: string;
}

export type VisibilitySampler = (
  target: VisibilityTarget,
  longitudeEastDeg: number,
  latitudeDeg: number,
) => VisibilitySample | null;

/** What the globe reports back about the layer. */
export interface VisibilityRuntime {
  readonly status: 'idle' | 'loading' | 'ready' | 'unavailable';
  /** The frame whose imagery and numbers are shown (the controller's own, after both loaded). */
  readonly appliedTime: string | null;
  /** A newer frame is on its way; the applied one stays until it is in. */
  readonly loading: boolean;
  /** The last frame could not be loaded (shown briefly). */
  readonly failed: boolean;
  readonly sample: VisibilitySampler | null;
}

export const IDLE_RUNTIME: VisibilityRuntime = {
  status: 'idle',
  appliedTime: null,
  loading: false,
  failed: false,
  sample: null,
};

/** What applyVisibilityDisplay needs of the controller. */
export interface VisibilitySwitches {
  setVisible: (target: VisibilityTarget, visible: boolean) => void;
  setOpacity: (target: VisibilityTarget, alpha: number) => void;
}

/**
 * Switches, opacities and the frame for the app's time, onto the controller: the active overlay
 * shown, the other hidden, each at its own opacity.
 */
export function applyVisibilityDisplay(
  controller: VisibilitySwitches,
  requester: FrameRequester,
  display: VisibilityDisplay,
): void {
  for (const target of VISIBILITY_TARGETS) {
    const setting = display[target];
    controller.setVisible(target, setting.visible);
    controller.setOpacity(target, Math.min(1, Math.max(0, setting.opacity)));
  }
  if (display.frame !== null) requester.request(display.frame);
}

/** The bits of Cesium's ImageryLayerCollection the layer order needs. */
export interface LayerStack<L> {
  contains: (layer: L) => boolean;
  raiseToTop: (layer: L) => void;
}

/**
 * Puts the visibility overlay's layers on top of everything (basemap, elevation, slope), whatever
 * order things were switched on or frames applied. Missing or removed layers are skipped.
 */
export function raiseOverlayToTop<L>(stack: LayerStack<L>, layers: readonly (L | undefined)[]) {
  for (const layer of layers) {
    if (layer !== undefined && stack.contains(layer)) stack.raiseToTop(layer);
  }
}

/** The panel's frame line: the frame actually shown, or why there is none. */
export function frameLine(frame: string | null, runtime: VisibilityRuntime): string {
  if (runtime.status === 'unavailable') return UNAVAILABLE_TEXT;
  if (frame === null) return NO_FRAME_TEXT;
  if (runtime.appliedTime === null) return 'Loading visibility frame…';
  const shown = `Frame shown: ${formatFrameTime(runtime.appliedTime)}`;
  return runtime.loading ? `${shown} · loading the new frame…` : shown;
}

/** The readout: a main line and, with a frame, the grid and the frame's UTC time. */
export interface VisibilityReadout {
  readonly main: string;
  readonly detail: string | null;
}

export function visibilityReadout({
  runtime,
  frame,
  hasPoint,
  sample,
}: {
  runtime: VisibilityRuntime;
  frame: string | null;
  hasPoint: boolean;
  sample: VisibilitySample | null;
}): VisibilityReadout {
  if (runtime.status === 'unavailable') return { main: UNAVAILABLE_TEXT, detail: null };
  if (frame === null) return { main: NO_FRAME_TEXT, detail: null };
  if (runtime.appliedTime === null) return { main: 'Loading visibility…', detail: null };
  if (!hasPoint) {
    return { main: 'Point at the south pole, or tap it, to read the visibility.', detail: null };
  }
  if (!sample) {
    return { main: 'No data', detail: `${GRID_WORDS} · ${formatFrameTime(runtime.appliedTime)}` };
  }
  return {
    main: `Approx. visible disc: ${Math.round(sample.percentage)} %`,
    detail: `${GRID_WORDS} · ${formatFrameTime(sample.timeUTC)}`,
  };
}

/** Where the layers' readout reads: a map layer (by id) or a visibility target. */
export type ReadingSource =
  | { readonly kind: 'map'; readonly id: string }
  | { readonly kind: 'visibility'; readonly target: VisibilityTarget }
  | null;

/**
 * The visibility target the user last switched on or picked wins while it is shown (`prefer`);
 * null means a map layer was the last choice. Failing that, the map layer's own choice, then any
 * shown target.
 */
export function readingSource(
  mapActiveId: string | null,
  shown: readonly VisibilityTarget[],
  prefer: VisibilityTarget | null,
): ReadingSource {
  if (prefer !== null && shown.includes(prefer)) return { kind: 'visibility', target: prefer };
  const first = shown[0];
  if (prefer !== null && first) return { kind: 'visibility', target: first };
  if (mapActiveId !== null) return { kind: 'map', id: mapActiveId };
  return first ? { kind: 'visibility', target: first } : null;
}

/** An aborted fetch: a newer request replaced it, so it is not a failure to show. */
export function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
  );
}

export interface FrameRequester {
  request: (stamp: string) => void;
  stop: () => void;
}

/**
 * Loads one frame at a time; a time asked for meanwhile waits, and only the newest one waiting is
 * loaded next. So playback and dragging the time still show frames as they come in, instead of
 * each new request cancelling the last before it lands. `load` resolves false when its result was
 * superseded; that and aborts are quiet. `report` gets the loading and failure state.
 */
export function createFrameRequester(
  load: (stamp: string) => Promise<boolean>,
  report: (state: { loading: boolean; failed: boolean }) => void,
): FrameRequester {
  let busy = false;
  let pending: string | null = null;
  let applied: string | null = null;
  let stopped = false;
  const run = async (stamp: string) => {
    busy = true;
    report({ loading: true, failed: false });
    let failed = false;
    try {
      if (await load(stamp)) applied = stamp;
    } catch (error) {
      failed = !isAbortError(error);
    }
    busy = false;
    if (stopped) return;
    const next = pending;
    pending = null;
    if (next !== null && next !== applied) {
      void run(next);
      return;
    }
    report({ loading: false, failed });
  };
  return {
    request: (stamp) => {
      if (stopped) return;
      if (busy) {
        pending = stamp;
        return;
      }
      if (stamp === applied) return;
      void run(stamp);
    },
    stop: () => {
      stopped = true;
      pending = null;
    },
  };
}
