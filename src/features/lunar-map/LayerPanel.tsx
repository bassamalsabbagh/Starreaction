import { useId } from 'react';
import { StatusTag } from '../../components/StatusTag';
import type { LayerReading, MapLayer } from '../../services/mapLayers';
import {
  DEFAULT_LAYER_OPACITY,
  legendScale,
  readingStatus,
  storedDecimals,
  readoutText,
  type LayerSetting,
} from './mapLayerState';
import styles from './LayerPanel.module.css';

interface LayerPanelProps {
  layers: readonly MapLayer[];
  settings: Readonly<Record<string, LayerSetting>>;
  onToggle: (layerId: string) => void;
  onOpacity: (layerId: string, opacity: number) => void;
  /** The layer the readout reads (null when none is visible). */
  activeId: string | null;
  onActive: (layerId: string) => void;
  /** The active layer's value at the pointed or tapped spot, or null before there is one. */
  reading: LayerReading | null;
  onClose: () => void;
  /** The manifest's source id ("SRC-073"). */
  sourceId: string;
  /** Only the 512 px previews are drawn on this device. */
  previewOnly?: boolean;
  /** Layers some of whose images could not be loaded. */
  failedIds?: readonly string[];
}

/** The legend under a visible layer: a continuous bar from the team's colours, or why there is none. */
function Legend({ layer }: { layer: MapLayer }) {
  if (!layer.legend) {
    return (
      <p className={styles.note}>
        Legend unavailable: {layer.valuesUnavailable ?? 'no value scale for this layer.'}
      </p>
    );
  }
  const scale = legendScale(layer.legend);
  return (
    <figure className={styles.legend} aria-label={`${layer.label} legend, ${layer.unit}`}>
      <div className={styles.bar} style={{ background: scale.gradient }} aria-hidden="true" />
      <div className={styles.ticks}>
        {scale.ticks.map((tick) => (
          <span key={tick.value} className={styles.tick} style={{ left: `${tick.at * 100}%` }}>
            {tick.value.toFixed(storedDecimals(layer))}
          </span>
        ))}
      </div>
      <figcaption className={styles.unit}>
        {layer.label} ({layer.unit})
      </figcaption>
    </figure>
  );
}

/**
 * The map's layers (docs/LANDER_RULES.md, "Map layers: elevation and slope"): for each, a switch,
 * an opacity slider and a legend; which layer the readout reads; and the readout itself, read from
 * the value tiles (never from a colour). The layers are fixed in time.
 */
export function LayerPanel({
  layers,
  settings,
  onToggle,
  onOpacity,
  activeId,
  onActive,
  reading,
  onClose,
  sourceId,
  previewOnly = false,
  failedIds = [],
}: LayerPanelProps) {
  const baseId = useId();
  const visible = layers.filter((layer) => settings[layer.id]?.visible);
  const active = layers.find((layer) => layer.id === activeId) ?? null;
  const status = reading ? readingStatus(reading) : null;
  return (
    <section className={styles.panel} aria-labelledby={`${baseId}-title`}>
      <header className={styles.head}>
        <h2 id={`${baseId}-title`} className={styles.title}>
          Map layers
        </h2>
        <button
          type="button"
          className={styles.close}
          aria-label="Close map layers"
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

      <ul className={styles.layers}>
        {layers.map((layer) => {
          const setting = settings[layer.id];
          const on = setting?.visible ?? false;
          const opacity = Math.round((setting?.opacity ?? DEFAULT_LAYER_OPACITY) * 100);
          return (
            <li key={layer.id} className={styles.layer}>
              <label className={styles.toggle}>
                <input type="checkbox" checked={on} onChange={() => onToggle(layer.id)} />
                {layer.label}
              </label>
              <label className={styles.opacity}>
                <span>Opacity {opacity}%</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={opacity}
                  aria-label={`${layer.label} opacity`}
                  onChange={(event) => onOpacity(layer.id, Number(event.target.value) / 100)}
                />
              </label>
              {on ? <Legend layer={layer} /> : null}
              {failedIds.includes(layer.id) ? (
                <p className={styles.error} role="alert">
                  Couldn’t load the layer images. Switch the layer off and on to try again.
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {visible.length > 0 ? (
        <fieldset className={styles.active}>
          <legend className={styles.label}>Readings from</legend>
          {visible.map((layer) => (
            <label key={layer.id} className={styles.choice}>
              <input
                type="radio"
                name={`${baseId}-active`}
                checked={layer.id === activeId}
                onChange={() => onActive(layer.id)}
              />
              {layer.label}
            </label>
          ))}
        </fieldset>
      ) : null}

      {active ? (
        <p className={styles.readout} aria-live="polite" data-testid="layer-readout">
          {reading ? (
            <>
              {readoutText(active, reading)}
              {status ? <StatusTag>{status}</StatusTag> : null}
            </>
          ) : (
            `Point at the south pole, or tap it, to read the ${active.label.toLowerCase()}.`
          )}
        </p>
      ) : null}

      {previewOnly ? (
        <p className={styles.note}>
          Preview resolution on this device: the full images need more memory than a phone has.
        </p>
      ) : null}
      <p className={styles.note}>Slope: average over one pixel (160 m or 40 m), not a pass/fail.</p>
      <p className={styles.note}>
        160 m readings are the mean of 16 pixels and can differ from the colour under the cursor.
      </p>
      <p className={styles.note}>
        Source: Team raster ({sourceId}; origin to be recorded). Real data at 40 m; Calculated at
        160 m (the mean of 4 × 4 pixels). Covers 80° S to the pole; the layers don’t change with the
        time.
      </p>
    </section>
  );
}
