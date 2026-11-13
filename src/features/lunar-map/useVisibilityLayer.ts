import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LatLon } from '../../utils/lunarSky';
import {
  IDLE_RUNTIME,
  INITIAL_VISIBILITY,
  shownTargets,
  snapToFrame,
  visibilityDisplay,
  visibilityReadout,
  type VisibilityReadout,
  type VisibilityRuntime,
  type VisibilitySettings,
  type VisibilityTarget,
} from './visibilityLayer';

/** A frame that failed to load is reported for this long. */
export const FAILURE_SHOW_MS = 4000;

/**
 * The visibility prototype layer's state: the switches, the frame for the app's time, what the
 * globe reports back (applied frame, loading, failure), and the readout at a point.
 */
export function useVisibilityLayer(time: number) {
  const [settings, setSettings] = useState<VisibilitySettings>(INITIAL_VISIBILITY);
  /** The target the readings follow, until a map layer is switched on or picked (null). */
  const [prefer, setPrefer] = useState<VisibilityTarget | null>(null);
  const [runtime, setRuntime] = useState<VisibilityRuntime>(IDLE_RUNTIME);
  const frame = snapToFrame(time);
  const display = useMemo(() => visibilityDisplay(settings, frame), [settings, frame]);
  const shown = shownTargets(settings);

  const report = useCallback(
    (patch: Partial<VisibilityRuntime>) => setRuntime((current) => ({ ...current, ...patch })),
    [],
  );
  useEffect(() => {
    if (!runtime.failed) return undefined;
    const id = window.setTimeout(() => report({ failed: false }), FAILURE_SHOW_MS);
    return () => window.clearTimeout(id);
  }, [runtime.failed, report]);

  const toggle = () => {
    if (runtime.status === 'unavailable') return;
    const on = !settings.on;
    setSettings((current) => ({ ...current, on, started: current.started || on }));
    if (on) setPrefer(settings.active);
  };
  /** One overlay at a time: choosing one shows it and hides the other; each keeps its opacity. */
  const choose = (target: VisibilityTarget) => {
    setSettings((current) => ({ ...current, active: target }));
    setPrefer(target);
  };
  const setOpacity = (target: VisibilityTarget, opacity: number) =>
    setSettings((current) => ({ ...current, opacity: { ...current.opacity, [target]: opacity } }));

  const readAt = (target: VisibilityTarget, point: LatLon | null): VisibilityReadout =>
    visibilityReadout({
      runtime,
      frame,
      hasPoint: point !== null,
      sample: point && runtime.sample ? runtime.sample(target, point.lon, point.lat) : null,
    });

  return {
    settings,
    runtime,
    frame,
    display,
    shown,
    prefer,
    toggle,
    choose,
    setOpacity,
    setPrefer,
    report,
    readAt,
  };
}
