import {
  NO_FRAME_TEXT,
  TARGET_LABELS,
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
  /** A Layers tile: shows this overlay, or switches it off when it is the one showing. */
  onShow: (target: VisibilityTarget) => void;
  onOpacity: (target: VisibilityTarget, opacity: number) => void;
}

/** The two ends of each overlay's legend, in words. */
const VISIBILITY_ENDS: Readonly<Record<VisibilityTarget, { low: string; high: string }>> = {
  sun: { low: 'Rarely sunlit 0%', high: 'Often sunlit, more power 100%' },
  earth: { low: 'Rarely in view 0%', high: 'Often in view, more contact 100%' },
};

/**
 * The overlay's fixed legend in its own palette (src/data/visibility/palette.json), over a
 * checkerboard so the transparent 0 % end and the opacity growing toward 100 % both show.
 */
function VisibilityLegend({ target }: { target: VisibilityTarget }) {
  const stops = VISIBILITY_PALETTE[target];
  const ends = VISIBILITY_ENDS[target];
  return (
    <figure className={styles.legend} aria-label={`${TARGET_LABELS[target]} legend, % of the disc`}>
      <div className={styles.bar} aria-hidden="true">
        <div
          className={styles.fill}
          data-testid={`visibility-legend-${target}`}
          style={{ background: paletteGradient(stops) }}
        />
      </div>
      <div className={styles.ends}>
        <span>{ends.low}</span>
        <span>{ends.high}</span>
      </div>
    </figure>
  );
}

/**
 * What sits under a Sun or Earth visibility row once it is on: its legend, "No frame for this time"
 * when the time has no frame, and a failed load. The explanations are on the About page.
 */
export function VisibilityLayerItem({
  target,
  runtime,
  frame,
}: {
  target: VisibilityTarget;
  runtime: VisibilityRuntime;
  frame: string | null;
}) {
  return (
    <div className={styles.layer}>
      <VisibilityLegend target={target} />
      {frame === null ? (
        <p className={styles.frame} aria-live="polite" data-testid="visibility-frame">
          {NO_FRAME_TEXT}
        </p>
      ) : null}
      {runtime.failed ? (
        <p className={styles.error} role="alert">
          Couldn’t load the visibility frame for this time.
        </p>
      ) : null}
    </div>
  );
}
