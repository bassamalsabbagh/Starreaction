import { joinClassNames } from '../../utils/classNames';
import {
  DAY_MS,
  HOUR_MS,
  dayTicks,
  formatClock,
  formatDayMonth,
  windowStatus,
  windowStatusText,
  type TimeWindowMs,
} from '../../utils/time';
import { PLAY_SPEEDS, useTime } from './timeContext';
import styles from './TimeBar.module.css';

interface TimeBarProps {
  /** Landing windows at the selected site (Sun and Earth both up), drawn as green zones. */
  windows: readonly TimeWindowMs[];
  /** Whose windows they are, for the legend ("IM-1 Odysseus"); null when no site is selected. */
  windowsFor: string | null;
  /** Folded to a thin line; the shell keeps this so the overlays above can follow. */
  folded: boolean;
  onFoldedChange: (folded: boolean) => void;
  /** Its id, so a skip button can move focus to it. */
  id?: string;
  className?: string;
}

const ICON = {
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

/**
 * The timeline along the bottom, Windy-style: Play first, the speeds, a day strip across the full
 * width with the selected site's landing windows (teal; computed from the real Sun and Earth) and
 * an orange marker for the selected time; scrub, step or play through one synodic month (29.5
 * days) around the app time. Folds to a line with its handle.
 */
export function TimeBar({
  windows,
  windowsFor,
  folded,
  onFoldedChange,
  id,
  className,
}: TimeBarProps) {
  const {
    time,
    range,
    setScrubbing,
    mode,
    playing,
    speed,
    setTime,
    stepBy,
    goLive,
    setPlaying,
    setSpeed,
    openEditor,
  } = useTime();
  const toggleFolded = () => onFoldedChange(!folded);

  // Hold the range still while the slider is dragged; let go anywhere ends it. Playback stops
  // (it would fight the drag), and whichever of up or cancel comes first removes both
  // listeners, so none is left behind to end a later drag early.
  const startScrub = () => {
    setScrubbing(true);
    if (playing) setPlaying(false);
    const end = () => {
      setScrubbing(false);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };
  const span = range.end - range.start;
  const at = (ms: number) => Math.min(100, Math.max(0, ((ms - range.start) / span) * 100));

  const zones = windows
    .filter((window) => window.end > range.start && window.start < range.end)
    .map((window) => ({
      window,
      left: at(window.start),
      width: at(window.end) - at(window.start),
    }));
  const status = windowStatus(windows, time, range);
  const ticks = dayTicks(range);
  const marker = at(Math.min(range.end, Math.max(range.start, time)));

  if (folded) {
    return (
      <div
        className={joinClassNames(styles.bar, styles.folded, className)}
        id={id}
        tabIndex={-1}
        role="group"
        aria-label="Time bar"
        data-tour="timebar"
      >
        <div className={styles.line} aria-hidden="true">
          {zones.map(({ window, left, width }) => (
            <span
              key={window.start}
              className={styles.lineZone}
              style={{ left: `${left}%`, width: `${width}%` }}
            />
          ))}
          <span className={styles.lineMark} style={{ left: `${at(time)}%` }} />
        </div>
        <button
          type="button"
          className={styles.handle}
          aria-label="Show the time bar"
          aria-expanded={false}
          onClick={toggleFolded}
        >
          <span aria-hidden="true">Timeline</span>
          <svg {...ICON}>
            <path d="M5.5 12.5 10 8l4.5 4.5" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div
      className={joinClassNames(styles.bar, className)}
      id={id}
      tabIndex={-1}
      role="group"
      aria-label="Time bar"
      data-tour="timebar"
    >
      <div className={styles.controls}>
        <button
          type="button"
          className={joinClassNames(styles.icon, styles.play)}
          aria-label={playing ? 'Pause' : 'Play'}
          title={playing ? 'Pause' : 'Play'}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? (
            <svg {...ICON}>
              <path
                d="M6.25 5h2.5v10h-2.5zM11.25 5h2.5v10h-2.5z"
                fill="currentColor"
                stroke="none"
              />
            </svg>
          ) : (
            <svg {...ICON}>
              <path d="M7 5.2v9.6L14.8 10z" fill="currentColor" />
            </svg>
          )}
        </button>

        <div className={styles.speeds} role="group" aria-label="Playback speed">
          {PLAY_SPEEDS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={styles.speed}
              title={entry.hint}
              aria-pressed={speed === entry.id}
              onClick={() => setSpeed(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={joinClassNames(styles.icon, styles.step)}
          aria-label="Back 1 day"
          title="Back 1 day"
          onClick={() => stepBy(-DAY_MS)}
        >
          <svg {...ICON}>
            <path d="M12 5.5 7.5 10l4.5 4.5" />
          </svg>
        </button>
        <button
          type="button"
          className={joinClassNames(styles.icon, styles.step)}
          aria-label="Forward 1 day"
          title="Forward 1 day"
          onClick={() => stepBy(DAY_MS)}
        >
          <svg {...ICON}>
            <path d="m8 5.5 4.5 4.5L8 14.5" />
          </svg>
        </button>
        <button
          type="button"
          className={styles.icon}
          aria-label="Set the date and time"
          title="Set the date and time"
          onClick={(event) => openEditor(event.currentTarget)}
        >
          <svg {...ICON}>
            <rect x="3.5" y="4.5" width="13" height="12" rx="1.5" />
            <path d="M3.5 8.5h13M7 3v3M13 3v3" />
          </svg>
        </button>

        <div className={styles.info}>
          {status.kind === 'none' ? (
            <span className={styles.countdown}>{windowStatusText(status)}</span>
          ) : (
            <button
              type="button"
              className={joinClassNames(styles.countdown, styles.countdownButton)}
              title={`${windowStatusText(status)}. Jump to the start of this window`}
              onClick={() => setTime(status.window.start)}
            >
              {windowStatusText(status)}
            </button>
          )}
          <span
            className={styles.legend}
            title={`${windowsFor ? `Landing windows · ${windowsFor}` : 'No site selected'} · ${formatDayMonth(range.start)} – ${formatDayMonth(range.end)}`}
          >
            <span className={styles.legendZone} aria-hidden="true" />
            <span className={styles.legendText}>
              {windowsFor ? (
                <>
                  <span className={styles.legendPrefix}>Landing windows · </span>
                  {windowsFor}
                </>
              ) : (
                'No site selected'
              )}{' '}
              · {formatDayMonth(range.start)} – {formatDayMonth(range.end)}
            </span>
          </span>
        </div>

        <button
          type="button"
          className={joinClassNames(styles.text, mode === 'live' && styles.textQuiet)}
          onClick={goLive}
        >
          Now
        </button>
        <button
          type="button"
          className={styles.handle}
          aria-label="Fold the time bar"
          aria-expanded={true}
          onClick={toggleFolded}
        >
          <span className={styles.handleLabel} aria-hidden="true">
            Hide
          </span>
          <svg {...ICON}>
            <path d="M5.5 7.5 10 12l4.5-4.5" />
          </svg>
        </button>
      </div>

      {/* The day strip: a tick at every UTC midnight, a label every few days (thinner on small
          screens), and the selected time's marker running through it. */}
      <div className={styles.days} aria-hidden="true">
        {ticks.map((tick) => (
          <span
            key={tick.ms}
            className={styles.day}
            data-every2={tick.index % 2 === 0}
            data-every3={tick.index % 3 === 0}
            data-every6={tick.index % 6 === 0}
            style={{ left: `${at(tick.ms)}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>

      <div className={styles.track}>
        <div className={styles.rail} aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick.ms} className={styles.tick} style={{ left: `${at(tick.ms)}%` }} />
          ))}
          {zones.map(({ window, left, width }) => (
            <span
              key={window.start}
              className={styles.zone}
              style={{ left: `${left}%`, width: `${width}%` }}
            />
          ))}
        </div>
        <span className={styles.marker} style={{ left: `${marker}%` }} aria-hidden="true" />
        <input
          className={styles.slider}
          type="range"
          min={range.start}
          max={range.end}
          step={HOUR_MS}
          value={Math.min(range.end, Math.max(range.start, time))}
          aria-label="Time"
          aria-valuetext={formatClock(time)}
          onPointerDown={startScrub}
          onChange={(event) => setTime(Number(event.target.value))}
        />
      </div>
    </div>
  );
}
