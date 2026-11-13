import { legendScale } from './mapLayerState';
import {
  TARGET_LABELS,
  UNAVAILABLE_TEXT,
  VISIBILITY_LABEL,
  VISIBILITY_MEANING,
  VISIBILITY_SWITCH_LABEL,
  VISIBILITY_TARGETS,
  frameLine,
  visibilityLegendStops,
  type VisibilityRuntime,
  type VisibilitySettings,
  type VisibilityTarget,
} from './visibilityLayer';
import styles from './VisibilityLayerItem.module.css';

export interface VisibilityControls {
  settings: VisibilitySettings;
  runtime: VisibilityRuntime;
  /** The frame for the app's time, or null outside the supplied frames. */
  frame: string | null;
  onToggle: () => void;
  onToggleTarget: (target: VisibilityTarget) => void;
  onOpacity: (target: VisibilityTarget, opacity: number) => void;
}

/** The fixed 0–100 % legend from the manifest's colours (the same for every frame). */
function VisibilityLegend({ colors }: { colors: VisibilityRuntime['colors'] }) {
  const stops = visibilityLegendStops(colors);
  if (stops.length < 2) return null;
  const scale = legendScale({ stops, min: 0, max: 1 });
  return (
    <figure className={styles.legend} aria-label="Visibility legend, % of the disc">
      <div className={styles.bar} style={{ background: scale.gradient }} aria-hidden="true" />
      <div className={styles.ticks}>
        {scale.ticks.map((tick) => (
          <span key={tick.value} className={styles.tick} style={{ left: `${tick.at * 100}%` }}>
            {Math.round(tick.value * 100)} %
          </span>
        ))}
      </div>
      <figcaption className={styles.unit}>Approx. visible disc (%)</figcaption>
    </figure>
  );
}

/**
 * The visibility prototype in the map layers panel (docs/LANDER_RULES.md, "Visibility prototype
 * layer"): one switch that shows the Sun and Earth layers, each with its own switch and opacity;
 * the legend, the fixed label and the frame actually shown.
 */
export function VisibilityLayerItem({
  settings,
  runtime,
  frame,
  onToggle,
  onToggleTarget,
  onOpacity,
}: VisibilityControls) {
  const unavailable = runtime.status === 'unavailable';
  return (
    <li className={styles.layer}>
      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={settings.on && !unavailable}
          disabled={unavailable}
          onChange={onToggle}
        />
        {VISIBILITY_SWITCH_LABEL}
      </label>
      {unavailable ? <p className={styles.note}>{UNAVAILABLE_TEXT}</p> : null}
      {settings.on && !unavailable ? (
        <>
          {VISIBILITY_TARGETS.map((target) => {
            const label = TARGET_LABELS[target];
            const setting = settings[target];
            const opacity = Math.round(setting.opacity * 100);
            return (
              <div key={target} className={styles.target}>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={setting.visible}
                    onChange={() => onToggleTarget(target)}
                  />
                  {label}
                </label>
                <label className={styles.opacity}>
                  <span>Opacity {opacity}%</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={opacity}
                    aria-label={`${label} opacity`}
                    onChange={(event) => onOpacity(target, Number(event.target.value) / 100)}
                  />
                </label>
              </div>
            );
          })}
          <VisibilityLegend colors={runtime.colors} />
          <p className={styles.label}>{VISIBILITY_LABEL}</p>
          <p className={styles.note}>{VISIBILITY_MEANING}</p>
          <p className={styles.frame} aria-live="polite" data-testid="visibility-frame">
            {frameLine(frame, runtime)}
          </p>
          {runtime.failed ? (
            <p className={styles.error} role="alert">
              Couldn’t load the visibility frame for this time.
            </p>
          ) : null}
          <p className={styles.note}>
            Source: team prototype (SRC-074). Covers 80° S to the pole; not a landing or power
            check.
          </p>
        </>
      ) : null}
    </li>
  );
}
