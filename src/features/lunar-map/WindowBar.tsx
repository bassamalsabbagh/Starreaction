import {
  formatDayMonth,
  formatDuration,
  windowStatus,
  type TimeRange,
  type TimeWindowMs,
} from '../../utils/time';
import styles from './WindowBar.module.css';

interface WindowBarProps {
  /** The site's landing windows (real Sun and Earth over the range). */
  windows: readonly TimeWindowMs[];
  /** The app's time: the marker. */
  time: number;
  range: TimeRange;
}

/**
 * The site's current or next landing window as one bar: it opens on the left, closes on the
 * right, and the marker is the selected time (before the bar when the window is still to come).
 */
export function WindowBar({ windows, time, range }: WindowBarProps) {
  const status = windowStatus(windows, time, range);
  if (status.kind === 'none') {
    return (
      <p className={styles.none} data-testid="window-bar">
        No landing window left in this month.
      </p>
    );
  }
  const { window } = status;
  const from = Math.min(time, window.start);
  const span = Math.max(1, window.end - from);
  const at = (ms: number) => ((ms - from) / span) * 100;
  // An open-ended window (a long polar day) has no known close: no countdown to it.
  const text =
    status.kind === 'open'
      ? window.openEnd
        ? `Open now, still open after ${formatDayMonth(window.end)}`
        : `Open now, closes in ${formatDuration(status.closesInMs)}`
      : `Opens in ${formatDuration(status.opensInMs)}`;
  return (
    <div className={styles.windowBar} data-testid="window-bar">
      <p className={styles.status}>
        <span className={styles.statusDot} aria-hidden="true" />
        {text}
      </p>
      <div className={styles.track} aria-hidden="true">
        <span
          className={styles.window}
          style={{ left: `${at(window.start)}%`, width: `${at(window.end) - at(window.start)}%` }}
        />
        <span className={styles.marker} style={{ left: `${at(time)}%` }} />
      </div>
      <p className={styles.ends}>
        <span>
          Opens {window.openStart ? 'before ' : ''}
          {formatDayMonth(window.start)}
        </span>
        <span>
          Closes {window.openEnd ? 'after ' : ''}
          {formatDayMonth(window.end)}
        </span>
      </p>
    </div>
  );
}
