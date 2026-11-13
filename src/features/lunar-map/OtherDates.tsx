import { useMemo, useState } from 'react';
import { Collapsible } from '../../components/Collapsible';
import { assessSky, formatShare, type DemoMission } from '../../data/demoData';
import { siteHourlySky, type HorizonsSeries } from '../../services/horizonsData';
import type { LatLon } from '../../utils/lunarSky';
import { sampledSpan, siteSky } from '../../utils/skyVisibility';
import type { HorizonProfile } from '../../utils/terrainShadow';
import {
  RANGE_MS,
  dayCentre,
  formatDayMonth,
  formatWindowRange,
  formatWindowDays,
  rangeAround,
} from '../../utils/time';
import styles from './OtherDates.module.css';

interface OtherDatesProps {
  place: LatLon;
  mission: DemoMission;
  time: number;
  /** The place's terrain horizon, when known: the checks then count it (as everywhere else). */
  terrain?: HorizonProfile | null;
  /** A fixed site's JPL Horizons positions (the engine where they have no data, and for points). */
  series?: HorizonsSeries | null;
  /** Moves the app's time to a month's best window. */
  onGo: (ms: number) => void;
  /** A new number opens the list (the guided demo). */
  revealSeq?: number;
}

/** How many months ahead to look, the current one included. */
const OTHER_DATES_MONTHS = 6;

/**
 * The same place across the next months: each month's best window and whether it suits the
 * mission, to answer "if we slip, what do we get?". Worked out only while open, from the same
 * real Sun and Earth as everything else.
 */
export function OtherDates({
  place,
  mission,
  time,
  terrain = null,
  series = null,
  onGo,
  revealSeq = 0,
}: OtherDatesProps) {
  const [open, setOpen] = useState(false);
  const [revealSeen, setRevealSeen] = useState(revealSeq);
  if (revealSeq !== revealSeen) {
    setRevealSeen(revealSeq);
    if (!open) setOpen(true);
  }
  const centre = dayCentre(time);
  const months = useMemo(() => {
    if (!open) return [];
    return Array.from({ length: OTHER_DATES_MONTHS }, (_, index) => {
      const range = rangeAround(centre + index * RANGE_MS);
      const samples = siteHourlySky(series, place, sampledSpan(range)).samples;
      const sky = siteSky(samples, place, mission, range, terrain);
      return { range, assessment: assessSky(sky, mission, range) };
    });
  }, [open, centre, place, mission, terrain, series]);

  return (
    <Collapsible
      title="Other dates"
      meta={`Next ${OTHER_DATES_MONTHS} months`}
      variant="body"
      open={open}
      onToggle={() => setOpen(!open)}
    >
      <ol className={styles.list} aria-label="Best window in each of the next months">
        {months.map(({ range, assessment }, index) => {
          const window = assessment.bestWindow;
          const span = `${formatDayMonth(range.start)} – ${formatDayMonth(range.end)}`;
          return (
            <li key={range.start} className={styles.row}>
              <span className={styles.when}>
                {index === 0 ? 'This month' : span}
                <span className={styles.sub}>
                  {assessment.suitable ? 'OK for the mission' : 'Not suitable'} · Earth up{' '}
                  {formatShare(assessment.sky.earthPct)}
                </span>
              </span>
              <span className={styles.window}>
                {window ? (
                  <>
                    {formatWindowRange(window)}
                    <span className={styles.sub}>{formatWindowDays(window)}</span>
                  </>
                ) : (
                  <span className={styles.sub}>No window</span>
                )}
              </span>
              <button
                type="button"
                className={styles.go}
                aria-label={`Go to ${index === 0 ? 'this month' : span}`}
                onClick={() => onGo(window ? window.start : range.start + RANGE_MS / 2)}
              >
                Go
              </button>
            </li>
          );
        })}
      </ol>
    </Collapsible>
  );
}
