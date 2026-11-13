import {
  TARGET_LABELS,
  UNAVAILABLE_TEXT,
  VISIBILITY_LABEL,
  VISIBILITY_MEANING,
  VISIBILITY_SWITCH_LABEL,
  VISIBILITY_TARGETS,
  frameLine,
  type VisibilityRuntime,
  type VisibilitySettings,
  type VisibilityTarget,
} from './visibilityLayer';
import { VISIBILITY_PALETTE, paletteGradient } from './visibilityPalette';
import styles from './VisibilityLayerItem.module.css';

export interface VisibilityControls {
  settings: VisibilitySettings;
  runtime: VisibilityRuntime;
  /** The frame for the app's time, or null outside the supplied frames. */
  frame: string | null;
  onToggle: () => void;
  /** Shows this overlay and hides the other. */
  onChoose: (target: VisibilityTarget) => void;
  onOpacity: (target: VisibilityTarget, opacity: number) => void;
}

/** The buttons' short names. */
const SHORT_LABELS: Readonly<Record<VisibilityTarget, string>> = { sun: 'Sun', earth: 'Earth' };

/**
 * The overlay's fixed 0–100 % legend in its own palette (src/data/visibility/palette.json), over a
 * checkerboard so the transparent 0 % end and the opacity growing toward 100 % both show.
 */
function VisibilityLegend({ target }: { target: VisibilityTarget }) {
  const stops = VISIBILITY_PALETTE[target];
  return (
    <figure className={styles.legend} aria-label={`${TARGET_LABELS[target]} legend, % of the disc`}>
      <div className={styles.bar} aria-hidden="true">
        <div
          className={styles.fill}
          data-testid={`visibility-legend-${target}`}
          style={{ background: paletteGradient(stops) }}
        />
      </div>
      <div className={styles.ticks}>
        <span className={styles.tick} style={{ left: '0%' }}>
          0 % (transparent)
        </span>
        <span className={styles.tick} style={{ left: '50%' }}>
          50 %
        </span>
        <span className={styles.tick} style={{ left: '100%' }}>
          100 %
        </span>
      </div>
      <figcaption className={styles.unit}>
        {SHORT_LABELS[target]}: approx. visible disc (%); 0 % is transparent, so the terrain shows
        through
      </figcaption>
    </figure>
  );
}

/**
 * The visibility prototype in the map layers panel (docs/LANDER_RULES.md, "Visibility prototype
 * layer"): one switch, then Sun | Earth buttons choosing the one overlay shown, its opacity (each
 * keeps its own), its legend, the fixed label and the frame actually shown.
 */
export function VisibilityLayerItem({
  settings,
  runtime,
  frame,
  onToggle,
  onChoose,
  onOpacity,
}: VisibilityControls) {
  const unavailable = runtime.status === 'unavailable';
  const active = settings.active;
  const label = TARGET_LABELS[active];
  const opacity = Math.round(settings.opacity[active] * 100);
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
          <div className={styles.segmented} role="group" aria-label="Visibility overlay">
            {VISIBILITY_TARGETS.map((target) => {
              const stops = VISIBILITY_PALETTE[target];
              const top = stops[stops.length - 1]?.color;
              return (
                <button
                  key={target}
                  type="button"
                  className={styles.segment}
                  aria-pressed={target === active}
                  onClick={() => onChoose(target)}
                >
                  <span className={styles.swatch} style={{ background: top }} aria-hidden="true" />
                  {SHORT_LABELS[target]}
                </button>
              );
            })}
          </div>
          <label className={styles.opacity}>
            <span>
              {SHORT_LABELS[active]} opacity {opacity}%
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={opacity}
              aria-label={`${label} opacity`}
              onChange={(event) => onOpacity(active, Number(event.target.value) / 100)}
            />
          </label>
          <VisibilityLegend target={active} />
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
