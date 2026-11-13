import { joinClassNames } from '../../utils/classNames';
import styles from './ZoomReadout.module.css';

export interface ReadoutValues {
  altitude: string;
  zoom: string;
  /** The ground distance across the visible map, edge to edge ("1,240 km"). */
  distance: string;
}

/**
 * Camera altitude, zoom and how far the view reaches across. Information only: not a control, not
 * announced live. Plain numbers, no moving scale bar.
 */
export function ZoomReadout({ values, className }: { values: ReadoutValues; className?: string }) {
  return (
    <div className={joinClassNames(styles.readout, className)} role="group" aria-label="Map view">
      <span className={styles.item}>
        <span className={styles.label}>Altitude</span>
        <span className={styles.value}>{values.altitude}</span>
      </span>
      <span className={styles.item}>
        <span className={styles.label}>Zoom</span>
        <span className={styles.value}>{values.zoom}</span>
      </span>
      <span className={styles.item}>
        <span className={styles.label}>Distance</span>
        <span className={styles.value}>{values.distance}</span>
      </span>
    </div>
  );
}
