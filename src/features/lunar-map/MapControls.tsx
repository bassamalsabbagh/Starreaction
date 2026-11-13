import type { ReactNode } from 'react';
import { Tooltip } from '../../components/Tooltip';
import { joinClassNames } from '../../utils/classNames';
import type { ElevationLayer } from '../../utils/elevationGrid';
import styles from './MapControls.module.css';

interface MapControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onWholeMoon: () => void;
  /** The tilted view over the south pole, where the polar sites fill the screen. */
  onSouthPole?: () => void;
  showGrid: boolean;
  onShowGridChange: (show: boolean) => void;
  /** Presentation mode: just the Moon, the time bar and a small site label. */
  onPresent?: () => void;
  /** The south-pole elevation or slope layer shown, if any. */
  elevationLayer?: ElevationLayer | null;
  /** False until an elevation file is loaded: the layer buttons then say "no data loaded yet". */
  elevationAvailable?: boolean;
  onElevationLayerChange?: (layer: ElevationLayer | null) => void;
  className?: string;
}

const NO_ELEVATION_YET = 'no elevation data loaded yet';

const ICON_PROPS = {
  viewBox: '0 0 20 20',
  width: 20,
  height: 20,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

interface IconButtonProps {
  label: string;
  tip: string;
  onClick: () => void;
  pressed?: boolean;
  /** Shown but not usable yet (its tip says why); aria-disabled, so the tip still shows. */
  unavailable?: boolean;
  children: ReactNode;
}

function IconButton({
  label,
  tip,
  onClick,
  pressed,
  unavailable = false,
  children,
}: IconButtonProps) {
  return (
    <Tooltip content={tip} placement="left">
      {(describedBy) => (
        <button
          type="button"
          className={joinClassNames(
            styles.button,
            pressed && styles.buttonOn,
            unavailable && styles.buttonUnavailable,
          )}
          onClick={unavailable ? undefined : onClick}
          aria-label={label}
          aria-pressed={pressed}
          aria-disabled={unavailable || undefined}
          aria-describedby={describedBy}
        >
          {children}
        </button>
      )}
    </Tooltip>
  );
}

/**
 * The map's own tools, a slim column on the right edge: zoom, whole Moon, the coordinate grid and
 * presentation mode. Each icon has a tooltip (on hover and focus) and an accessible name.
 */
export function MapControls({
  onZoomIn,
  onZoomOut,
  onWholeMoon,
  onSouthPole,
  showGrid,
  onShowGridChange,
  onPresent,
  elevationLayer = null,
  elevationAvailable = false,
  onElevationLayerChange,
  className,
}: MapControlsProps) {
  const toggleLayer = (layer: ElevationLayer) =>
    onElevationLayerChange?.(elevationLayer === layer ? null : layer);
  return (
    <div className={joinClassNames(styles.controls, className)} role="group" aria-label="Map">
      <IconButton label="Zoom in" tip="Zoom in" onClick={onZoomIn}>
        <svg {...ICON_PROPS}>
          <path d="M10 4.5v11M4.5 10h11" />
        </svg>
      </IconButton>
      <IconButton label="Zoom out" tip="Zoom out" onClick={onZoomOut}>
        <svg {...ICON_PROPS}>
          <path d="M4.5 10h11" />
        </svg>
      </IconButton>
      <span className={styles.rule} aria-hidden="true" />
      <IconButton label="Whole Moon" tip="Whole Moon" onClick={onWholeMoon}>
        <svg {...ICON_PROPS}>
          <circle cx="10" cy="10" r="6.5" />
          <circle cx="7.8" cy="8.2" r="1.3" />
          <circle cx="12.2" cy="12" r="0.9" />
        </svg>
      </IconButton>
      {onSouthPole ? (
        <IconButton
          label="South pole"
          tip="South pole: tilted, so the polar sites fill the screen"
          onClick={onSouthPole}
        >
          <svg {...ICON_PROPS}>
            <circle cx="10" cy="10" r="6.5" />
            <path d="M4.6 13.2c3.2 1.4 7.6 1.4 10.8 0" />
            <circle cx="10" cy="16.5" r="0.9" fill="currentColor" />
          </svg>
        </IconButton>
      ) : null}
      <IconButton
        label="Latitude/longitude grid"
        tip="Latitude/longitude grid, every 30°"
        onClick={() => onShowGridChange(!showGrid)}
        pressed={showGrid}
      >
        <svg {...ICON_PROPS}>
          <circle cx="10" cy="10" r="6.5" />
          <path d="M3.5 10h13M10 3.5c-2.4 2-2.4 11 0 13M10 3.5c2.4 2 2.4 11 0 13" />
        </svg>
      </IconButton>
      {onElevationLayerChange ? (
        <>
          <IconButton
            label="Elevation"
            tip={
              elevationAvailable ? 'Elevation (LOLA), south pole' : `Elevation: ${NO_ELEVATION_YET}`
            }
            onClick={() => toggleLayer('elevation')}
            pressed={elevationLayer === 'elevation'}
            unavailable={!elevationAvailable}
          >
            <svg {...ICON_PROPS}>
              <path d="M3 15.5l4.5-7 3 4 2-2.5 4.5 5.5z" />
            </svg>
          </IconButton>
          <IconButton
            label="Slope"
            tip={elevationAvailable ? 'Slope (LOLA), south pole' : `Slope: ${NO_ELEVATION_YET}`}
            onClick={() => toggleLayer('slope')}
            pressed={elevationLayer === 'slope'}
            unavailable={!elevationAvailable}
          >
            <svg {...ICON_PROPS}>
              <path d="M3.5 15.5h13M3.5 15.5L16.5 6M12.5 15.5a4.5 4.5 0 0 0-1.2-3.1" />
            </svg>
          </IconButton>
        </>
      ) : null}
      {onPresent ? (
        <>
          <span className={styles.rule} aria-hidden="true" />
          <IconButton
            label="Presentation mode"
            tip="Presentation mode: just the Moon and the time bar (H)"
            onClick={onPresent}
            pressed={false}
          >
            <svg {...ICON_PROPS}>
              <path d="M3.5 7.5v-4h4M16.5 7.5v-4h-4M3.5 12.5v4h4M16.5 12.5v4h-4" />
            </svg>
          </IconButton>
        </>
      ) : null}
    </div>
  );
}
