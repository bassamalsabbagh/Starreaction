import { useId } from 'react';
import { StatusTag } from '../../components/StatusTag';
import type { LayerReading, MapLayer } from '../../services/mapLayers';
import { paletteGradient, VISIBILITY_PALETTE } from './visibilityPalette';
import {
  legendEnds,
  legendRange,
  legendScale,
  readingStatus,
  readoutText,
  type LayerSetting,
} from './mapLayerState';
import { VisibilityLayerItem, type VisibilityControls } from './VisibilityLayerItem';
import {
  TARGET_LABELS,
  UNAVAILABLE_TEXT,
  VISIBILITY_TARGETS,
  type VisibilityReadout,
  type VisibilityTarget,
} from './visibilityLayer';
import styles from './LayerPanel.module.css';

interface LayerPanelProps {
  layers: readonly MapLayer[];
  settings: Readonly<Record<string, LayerSetting>>;
  onToggle: (layerId: string) => void;
  /** Each layer's value at the pointed or tapped spot, by layer id (none before there is one). */
  readings: Readonly<Record<string, LayerReading>>;
  onClose: () => void;
  /** Layers some of whose images could not be loaded. */
  failedIds?: readonly string[];
  /**
   * The Sun and Earth visibility layers: their controls, which target the readings follow (null
   * when a map layer's) and their readout.
   */
  visibility?: VisibilityControls & {
    activeTarget: VisibilityTarget | null;
    readout: VisibilityReadout | null;
  };
}

/** The legend: a colour bar with its two ends in words, or why there is none. */
function Legend({ layer }: { layer: MapLayer }) {
  if (!layer.legend) {
    return (
      <p className={styles.note}>
        Legend unavailable: {layer.valuesUnavailable ?? 'no value scale for this layer.'}
      </p>
    );
  }
  const range = legendRange(layer.id, layer.legend);
  const scale = legendScale(layer.legend, range);
  const ends = legendEnds(layer, range.min, range.max);
  return (
    <figure className={styles.legend} aria-label={`${layer.label} legend, ${layer.unit}`}>
      <div className={styles.bar} style={{ background: scale.gradient }} aria-hidden="true" />
      <div className={styles.ends}>
        <span>{ends.low}</span>
        <span>{ends.high}</span>
      </div>
    </figure>
  );
}

/**
 * The map's layers: one row of small colour tiles with a name each, that switch a layer on or off
 * (at a fixed 80% opacity). The legend of a layer that is on sits directly under the row; the value under the pointer or tap shows at the foot when there is one. The
 * explanations, sources and limits are on the About page.
 */
export function LayerPanel({
  layers,
  settings,
  onToggle,
  readings,
  onClose,
  failedIds = [],
  visibility,
}: LayerPanelProps) {
  const baseId = useId();
  const unavailable = visibility?.runtime.status === 'unavailable';
  // One readout line for every layer that is on (a value only; no "No data" or prompt lines).
  const readoutLines = layers.flatMap((layer) => {
    const reading = settings[layer.id]?.visible ? readings[layer.id] : undefined;
    return reading?.kind === 'value' ? [{ layer, reading }] : [];
  });
  const visibilityReadout =
    visibility?.activeTarget && visibility.readout?.main.startsWith('Approx.')
      ? visibility.readout
      : null;
  return (
    <section className={styles.panel} aria-labelledby={`${baseId}-title`}>
      <header className={styles.head}>
        <h2 id={`${baseId}-title`} className={styles.title}>
          Layers
        </h2>
        <button
          type="button"
          className={styles.close}
          aria-label="Close map layers"
          title="Close (Esc)"
          onClick={onClose}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>

      {/* Above the row: the legend of each layer that is on, and the value under the pointer. */}
      {layers
        .filter((layer) => settings[layer.id]?.visible)
        .map((layer) => (
          <div key={layer.id} className={styles.legendBlock}>
            <Legend layer={layer} />
            {failedIds.includes(layer.id) ? (
              <p className={styles.error} role="alert">
                Couldn’t load the {layer.label.toLowerCase()} images. Switch the layer off and on to
                try again.
              </p>
            ) : null}
          </div>
        ))}
      {visibility && visibility.settings.on && !unavailable ? (
        <div className={styles.legendBlock}>
          <VisibilityLayerItem
            target={visibility.settings.active}
            runtime={visibility.runtime}
            frame={visibility.frame}
          />
        </div>
      ) : null}
      {readoutLines.length > 0 || visibilityReadout ? (
        <div className={styles.readout} aria-live="polite" data-testid="layer-readout">
          {readoutLines.map(({ layer, reading }) => {
            const status = readingStatus(reading);
            return (
              <p key={layer.id} className={styles.readoutLine} data-testid={`readout-${layer.id}`}>
                {readoutText(layer, reading)}
                {status ? <StatusTag>{status}</StatusTag> : null}
              </p>
            );
          })}
          {visibilityReadout ? (
            <p className={styles.readoutLine} data-testid="visibility-readout">
              {visibilityReadout.main}
            </p>
          ) : null}
        </div>
      ) : null}
      <ul className={styles.rows} aria-label="Layers to show">
        {layers.map((layer) => {
          const on = settings[layer.id]?.visible ?? false;
          return (
            <li key={layer.id} className={styles.rowItem}>
              <button
                type="button"
                className={styles.rowButton}
                aria-pressed={on}
                onClick={() => onToggle(layer.id)}
              >
                <span
                  className={styles.swatch}
                  style={{
                    background: layer.legend ? legendScale(layer.legend).gradient : undefined,
                  }}
                  aria-hidden="true"
                />
                <span className={styles.rowName}>{layer.label}</span>
              </button>
            </li>
          );
        })}
        {visibility
          ? VISIBILITY_TARGETS.map((target) => {
              const on =
                visibility.settings.on && visibility.settings.active === target && !unavailable;
              return (
                <li key={target} className={styles.rowItem}>
                  <button
                    type="button"
                    className={styles.rowButton}
                    aria-pressed={on}
                    disabled={unavailable}
                    onClick={() => visibility.onShow(target)}
                  >
                    <span
                      className={styles.swatch}
                      style={{ background: paletteGradient(VISIBILITY_PALETTE[target]) }}
                      aria-hidden="true"
                    />
                    <span className={styles.rowName}>{TARGET_LABELS[target]}</span>
                    <span className={styles.previewPill}>
                      <StatusTag>Preview</StatusTag>
                    </span>
                  </button>
                </li>
              );
            })
          : null}
      </ul>

      {unavailable ? <p className={styles.note}>{UNAVAILABLE_TEXT}</p> : null}
    </section>
  );
}
