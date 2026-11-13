import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { DemoMission, RankedSite } from '../../data/demoData';
import type { HorizonsSeries } from '../../services/horizonsData';
import { joinClassNames } from '../../utils/classNames';
import type { HorizonProfile } from '../../utils/terrainShadow';
import {
  DAY_MS,
  addMonthsUtc,
  formatClock,
  formatDayMonth,
  formatRangeUtc,
  type TimeRange,
} from '../../utils/time';
import { bracketDates, bracketPlace, monthTicks, moveBracket, type BracketDates } from './bracket';
import {
  SKY_STATE_TEXT,
  positionsNote,
  stateAt,
  utcDayStart,
  yearWindows,
  type SkyState,
} from './yearWindows';
import styles from './CompareTimeline.module.css';

interface CompareTimelineProps {
  /** The compared sites (their hours are the checked range's, hourly). */
  entries: readonly RankedSite[];
  mission: DemoMission;
  /** The range being checked: the bracket. */
  range: TimeRange;
  /** Whether the dates were picked (else the range is the time bar's 29.5 days). */
  picked: boolean;
  seriesFor: (siteId: string) => HorizonsSeries | null;
  terrainFor: (siteId: string) => HorizonProfile | null;
  /** The bracket moved: the new start and stop dates (whole days). */
  onMove: (dates: BracketDates) => void;
}

const MONTHS = 12;

const STATE_CLASS: Readonly<Record<SkyState, string | undefined>> = {
  both: styles.both,
  sun: styles.sun,
  earth: styles.earth,
  none: undefined,
};

/** "12 Dec 2026". */
const dateText = (ms: number) => `${formatDayMonth(ms)} ${new Date(ms).getUTCFullYear()}`;

/** "1,234 h". */
const hours = (value: number) => `${value.toLocaleString('en-US')} h`;

/**
 * The Timeline tab in Compare (docs/LANDER_RULES.md, "Timeline"): one row per compared site, 12
 * months from the start date, bars for what is up every 6 hours, and a see-through bracket over the
 * dates checked. Dragging the bracket, or the arrow keys on it, moves the dates by whole days; the
 * hours, the checks and the Sites list follow. The bars are worked out once per site, mission and
 * start, never while dragging.
 */
export function CompareTimeline({
  entries,
  mission,
  range,
  picked,
  seriesFor,
  terrainFor,
  onMove,
}: CompareTimelineProps) {
  // The 12 months start on the start date when the tab opens, and stay put while the bracket moves;
  // dates set elsewhere outside them start the months again (only when that changes the start, so
  // a range longer than the 12 months can never loop).
  const [origin, setOrigin] = useState(() => utcDayStart(range.start));
  const end = addMonthsUtc(origin, MONTHS);
  const wantedOrigin = utcDayStart(range.start);
  if ((range.start < origin || range.end > end) && wantedOrigin !== origin) {
    setOrigin(wantedOrigin);
  }
  const span = { from: origin, to: end };

  const siteKey = entries.map((entry) => entry.site.id).join('|');
  const { minSunElevationDeg, minEarthElevationDeg } = mission;
  const windows = useMemo(
    () =>
      new Map(
        entries.map((entry) => [
          entry.site.id,
          yearWindows(
            {
              lat: entry.site.lat,
              lon: entry.site.lon,
              thresholds: { minSunElevationDeg, minEarthElevationDeg },
              terrain: terrainFor(entry.site.id),
              series: seriesFor(entry.site.id),
            },
            origin,
            MONTHS,
          ),
        ]),
      ),
    // The sites, not the entries: entries change whenever the bracket moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [siteKey, origin, minSunElevationDeg, minEarthElevationDeg, seriesFor, terrainFor],
  );

  const tracksRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; dates: BracketDates; width: number; sent: number } | null>(
    null,
  );
  const dates = bracketDates(range);
  const place = bracketPlace(range, span);
  const totalDays = Math.round((end - origin) / DAY_MS);
  const lengthDays = Math.round((dates.stopMs - dates.startMs) / DAY_MS) + 1;
  const offset = Math.round((dates.startMs - origin) / DAY_MS);

  const move = (byDays: number, from: BracketDates = dates) => {
    const next = moveBracket(from, byDays, span);
    if (next.startMs !== dates.startMs || next.stopMs !== dates.stopMs) onMove(next);
    return next;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step: Readonly<Record<string, number>> = {
      ArrowLeft: -1,
      ArrowDown: -1,
      ArrowRight: 1,
      ArrowUp: 1,
      PageDown: -7,
      PageUp: 7,
      Home: -totalDays,
      End: totalDays,
    };
    const by = step[event.key];
    if (by === undefined) return;
    event.preventDefault();
    move(by);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const width = tracksRef.current?.getBoundingClientRect().width ?? 0;
    if (width <= 0) return;
    dragRef.current = { x: event.clientX, dates, width, sent: dates.startMs };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    // Whole days only: a new date is sent once per day crossed, never per pixel.
    const by = Math.round(((event.clientX - drag.x) / drag.width) * totalDays);
    const next = moveBracket(drag.dates, by, span);
    if (next.startMs !== drag.sent) {
      drag.sent = next.startMs;
      onMove(next);
    }
  };
  const endDrag = () => {
    dragRef.current = null;
  };

  const ticks = monthTicks(span);
  // While no dates are picked the range is the time bar's 29.5 days, not whole days: say so.
  const rangeText = picked
    ? `${dateText(dates.startMs)} to ${dateText(dates.stopMs)} (UTC)`
    : `the time bar’s 29.5 days (${formatRangeUtc(range.start, range.end)})`;
  // Each site's state at the bracket's start, for screen readers on the slider itself.
  const statesText = entries
    .map((entry) => {
      const year = windows.get(entry.site.id);
      const state = year ? stateAt(year, range.start) : null;
      return `${entry.site.name}: ${state ? SKY_STATE_TEXT[state] : 'outside the 12 months'}`;
    })
    .join('; ');
  const demo = mission.custom ? 'your mission’s' : 'this DEMO mission’s';

  return (
    <div className={styles.timeline} data-testid="compare-timeline">
      <p className={styles.intro}>
        12 months from {dateText(origin)}. Each bar shows what is up every 6 hours (a coarse view;
        the hours beside it are hourly, for the dates checked). Drag the bracket, or focus it and
        use the arrow keys, to move the dates by whole days.
      </p>
      <p className={styles.intro}>
        Up = at least {mission.minSunElevationDeg}° (Sun) / {mission.minEarthElevationDeg}° (Earth),{' '}
        {demo} minimums, and above the terrain where known.
      </p>
      <ul className={styles.legend} aria-label="Legend">
        {(['both', 'sun', 'earth', 'none'] as const).map((state) => (
          <li key={state} className={styles.legendItem}>
            <span
              className={joinClassNames(styles.swatch, STATE_CLASS[state] ?? styles.swatchNone)}
              aria-hidden="true"
            />
            {SKY_STATE_TEXT[state]}
          </li>
        ))}
      </ul>

      <div className={styles.chart}>
        <ol className={styles.labels} aria-label="Sites on the timeline">
          {entries.map((entry) => {
            const year = windows.get(entry.site.id);
            const state = year ? stateAt(year, range.start) : null;
            const { sky } = entry.assessment;
            return (
              <li key={entry.site.id} className={styles.label}>
                <span className={styles.name}>{entry.site.name}</span>
                <span className={styles.hours}>
                  Sun {hours(sky.sunHours)} · Earth {hours(sky.earthHours)} · both{' '}
                  {hours(sky.bothHours)}
                </span>
                <span className={styles.now}>
                  {state
                    ? `At ${formatDayMonth(range.start)}: ${SKY_STATE_TEXT[state]}`
                    : 'Outside the 12 months'}
                </span>
                {year ? <span className={styles.source}>{positionsNote(year)}</span> : null}
              </li>
            );
          })}
        </ol>

        <div className={styles.plot}>
          <div className={styles.axis} aria-hidden="true">
            {ticks.map((tick) => (
              <span key={tick.at} className={styles.tick} style={{ left: `${tick.left * 100}%` }}>
                {tick.label}
              </span>
            ))}
          </div>
          <div ref={tracksRef} className={styles.tracks}>
            {entries.map((entry) => {
              const year = windows.get(entry.site.id);
              return (
                <div
                  key={entry.site.id}
                  className={styles.track}
                  role="img"
                  aria-label={`${entry.site.name}: what is up over the 12 months`}
                >
                  {year?.runs.map((run) =>
                    run.state === 'none' ? null : (
                      <span
                        key={run.start}
                        className={joinClassNames(styles.run, STATE_CLASS[run.state])}
                        style={{
                          left: `${((run.start - origin) / (end - origin)) * 100}%`,
                          width: `${((run.end - run.start) / (end - origin)) * 100}%`,
                        }}
                        title={`${formatClock(run.start)} to ${formatClock(run.end)} (6-hour steps): ${SKY_STATE_TEXT[run.state]}`}
                        data-state={run.state}
                      />
                    ),
                  )}
                </div>
              );
            })}
            <div
              className={styles.bracket}
              style={{ left: `${place.left * 100}%`, width: `${place.width * 100}%` }}
              role="slider"
              tabIndex={0}
              aria-label="Dates checked"
              aria-valuemin={0}
              aria-valuemax={Math.max(0, totalDays - lengthDays)}
              aria-valuenow={offset}
              aria-valuetext={`${rangeText}; ${statesText}`}
              title={rangeText}
              onKeyDown={onKeyDown}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            />
          </div>
        </div>
      </div>
      <p className={styles.dates}>
        Dates checked: {rangeText}.{picked ? null : ' Moving the bracket picks 30 whole days.'}
      </p>
    </div>
  );
}
