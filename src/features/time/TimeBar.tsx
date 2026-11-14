import { useState, type PointerEvent } from 'react';
import { bodyNow, type PositionSamples } from '../../utils/riseSet';
import { joinClassNames } from '../../utils/classNames';
import {
  DAY_MS,
  HOUR_MS,
  dayTicks,
  formatAmman,
  formatClock,
  formatClockShort,
  formatDayMonth,
  goodTimeText,
  windowStatus,
  type TimeRange,
  type TimeWindowMs,
} from '../../utils/time';
import { TimePopover } from './TimePopover';
import { PLAY_SPEEDS, useTime } from './timeContext';
import styles from './TimeBar.module.css';

interface TimeBarProps {
  /** Good times to land at the selected site (Sun and Earth both up), drawn as green zones. */
  windows: readonly TimeWindowMs[];
  /** The selected site or point, whose Sun and Earth the status describes; null shows none. */
  site: { lat: number; lon: number } | null;
  /** A fixed site's own positions (JPL Horizons), used where they have the time; else the engine. */
  positions?: PositionSamples | null;
  /** Folded to a thin line; the shell keeps this so the overlays above can follow. */
  folded: boolean;
  onFoldedChange: (folded: boolean) => void;
  /** Its id, so a skip button can move focus to it. */
  id?: string;
  className?: string;
  /** The dates picked in the wizard: the bar covers exactly these instead of 29.5 days. */
  rangeOverride?: TimeRange | null;
  /** "No data after 31 Dec 2027": said beside the status when the time is outside the data. */
  limitNote?: string | null;
  /** The view has moved away from the dates picked in step 3: show "Back to my dates". */
  away?: boolean;
  onBackToDates?: () => void;
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

const SMALL = { viewBox: '0 0 14 14', width: 14, height: 14, 'aria-hidden': true } as const;

/** A small sun or Earth, so the status reads at a glance. */
function BodyIcon({ body }: { body: 'sun' | 'earth' }) {
  return body === 'sun' ? (
    <svg {...SMALL} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <circle cx="7" cy="7" r="2.6" fill="currentColor" stroke="none" />
      <path d="M7 1v1.6M7 11.4V13M1 7h1.6M11.4 7H13M2.8 2.8l1.1 1.1M10.1 10.1l1.1 1.1M11.2 2.8l-1.1 1.1M3.9 10.1l-1.1 1.1" />
    </svg>
  ) : (
    <svg {...SMALL} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <circle cx="7" cy="7" r="5.2" />
      <path d="M2.3 6c1.6-.2 2.2.8 2.8 1.4s1.6.4 1.5 1.6M8.3 2c-.2 1.2.5 1.9 1.4 2.2s1.8.5 2.1 1.3" />
    </svg>
  );
}

/**
 * The timeline along the bottom, one row: Play, the time (click for the calendar), ±1 day, a
 * speed choice, a plain-words status of the Sun and Earth at the place, then "Back to my dates"
 * (only when away) and Close. Under it the day strip: green is a good time to land (the Sun and
 * Earth both up as the mission needs), grey is not. Hover reads the time at that point; a click
 * jumps there.
 */
export function TimeBar({
  windows,
  site,
  positions = null,
  folded,
  onFoldedChange,
  id,
  className,
  rangeOverride = null,
  limitNote = null,
  away = false,
  onBackToDates,
}: TimeBarProps) {
  const {
    time,
    range: movingRange,
    setScrubbing,
    playing,
    speed,
    setTime,
    stepBy,
    setPlaying,
    setSpeed,
    editorOpen,
    openEditor,
    closeEditor,
  } = useTime();
  const range = rangeOverride ?? movingRange;
  const toggleFolded = () => onFoldedChange(!folded);
  // The calendar opens above the date button: it is drawn at the page's top level.
  const [dateWrap, setDateWrap] = useState<HTMLSpanElement | null>(null);
  const [hover, setHover] = useState<{ ms: number; pct: number } | null>(null);

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

  const skyNow = site
    ? {
        sun: bodyNow(site, 'sun', time, { positions }),
        earth: bodyNow(site, 'earth', time, { positions }),
      }
    : null;
  const degrees = (elevation: number) => Math.max(0, Math.round(elevation));

  const onTrackMove = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width <= 0) return;
    const fraction = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    setHover({
      ms: Math.round((range.start + fraction * span) / HOUR_MS) * HOUR_MS,
      pct: fraction * 100,
    });
  };

  // Closed: the Time button next to Layers (in the app) opens it.
  if (folded) return null;

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

        <span ref={setDateWrap} className={styles.dateWrap}>
          <button
            type="button"
            className={styles.date}
            aria-expanded={editorOpen}
            aria-haspopup="dialog"
            aria-label={`Time: ${formatClock(time)}. Change the date and time`}
            title={`${formatAmman(time)}. Click to set the date and time`}
            onClick={(event) => (editorOpen ? closeEditor() : openEditor(event.currentTarget))}
          >
            {formatClockShort(time)}
          </button>
          {editorOpen ? <TimePopover anchor={dateWrap} /> : null}
        </span>

        <button
          type="button"
          className={joinClassNames(styles.icon, styles.step)}
          aria-label="Back 1 day"
          title="Back 1 day"
          onClick={() => stepBy(-DAY_MS)}
        >
          −1 day
        </button>
        <button
          type="button"
          className={joinClassNames(styles.icon, styles.step)}
          aria-label="Forward 1 day"
          title="Forward 1 day"
          onClick={() => stepBy(DAY_MS)}
        >
          +1 day
        </button>

        <span className={styles.lineBreak} aria-hidden="true" />

        <label className={styles.speedPick}>
          <span className={styles.speedWord}>Speed:</span>
          <select
            className={styles.speedSelect}
            value={speed}
            aria-label="Playback speed"
            onChange={(event) => {
              const next = PLAY_SPEEDS.find((entry) => entry.id === event.target.value);
              if (next) setSpeed(next.id);
            }}
          >
            {PLAY_SPEEDS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.info}>
          {skyNow ? (
            <span className={styles.sky} data-testid="sky-status">
              <span className={styles.skyItem}>
                <BodyIcon body="sun" />
                {skyNow.sun.up ? `Sun up ${degrees(skyNow.sun.elevationDeg)}°` : 'Sun down'}
              </span>
              <span aria-hidden="true">·</span>
              <span className={joinClassNames(styles.skyItem, !skyNow.earth.up && styles.skyOff)}>
                <BodyIcon body="earth" />
                {skyNow.earth.up ? 'Earth in view' : 'Earth not in view'}
              </span>
              <span className="visually-hidden">
                {' '}
                (real Sun and Earth, on a smooth Moon: no terrain)
              </span>
            </span>
          ) : (
            <span className={styles.skyOff}>Pick a place to see the Sun and Earth</span>
          )}
          {limitNote ? (
            <span className={styles.limit} role="status">
              {limitNote}
            </span>
          ) : null}
        </div>

        {away && onBackToDates ? (
          <button type="button" className={styles.backToDates} onClick={onBackToDates}>
            Back to my dates
          </button>
        ) : null}
        <button
          type="button"
          className={styles.handle}
          aria-label="Close the time bar"
          aria-expanded={true}
          onClick={toggleFolded}
        >
          <svg {...ICON}>
            <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />
          </svg>
        </button>
      </div>

      <div
        className={styles.track}
        onPointerMove={onTrackMove}
        onPointerLeave={() => setHover(null)}
      >
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
        {hover ? (
          <span className={styles.hover} style={{ left: `${hover.pct}%` }} aria-hidden="true">
            {formatClockShort(hover.ms)}
          </span>
        ) : null}
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

      <div className={styles.foot}>
        <span className={styles.footDate}>{formatDayMonth(range.start)}</span>
        <span className={styles.legend}>
          <span className={styles.legendZone} aria-hidden="true" />
          Good time to land
        </span>
        <span className={styles.statusText} role="status">
          {goodTimeText(status)}
        </span>
        <span className={styles.footDate}>{formatDayMonth(range.end)}</span>
      </div>
    </div>
  );
}
