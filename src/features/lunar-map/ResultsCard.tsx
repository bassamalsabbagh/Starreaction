import { useId, useState } from 'react';
import { verdictText, type DemoMission, type SkyAssessment } from '../../data/demoData';
import { joinClassNames } from '../../utils/classNames';
import { formatDayMonth, tenthsOfDayDown } from '../../utils/time';
import { CheckTiles } from './CheckTiles';
import type { GoodWindow } from './goodWindows';
import styles from './ResultsCard.module.css';

interface ResultsCardProps {
  name: string;
  meta: string;
  assessment: SkyAssessment;
  mission: DemoMission;
  /** Which samples the numbers used. */
  dataSource: 'horizons' | 'engine' | 'mixed';
  /** The good windows ahead (null while they are worked out). */
  windows: readonly GoodWindow[] | null;
  /** "Go": those dates become the dates checked. */
  onGo: (window: GoodWindow) => void;
  onCompare: () => void;
  onMoreDetails: () => void;
  detailsOpen: boolean;
}

const DATA_TEXT: Readonly<Record<ResultsCardProps['dataSource'], string>> = {
  horizons: 'Data: JPL Horizons',
  engine: 'Data: our engine',
  mixed: 'Data: JPL Horizons and our engine',
};

/** How many recommended windows the card lists. */
const SHOWN_WINDOWS = 3;

/**
 * Step 4 (docs/LANDER_RULES.md, "The checks"): the verdict, three tiles (Sun up, Earth in view,
 * Sun + Earth together) with pass or fail, the next good dates, Compare and More details. The
 * same layout for a pass and a fail; everything else is in the details panel.
 */
export function ResultsCard({
  name,
  meta,
  assessment,
  mission,
  dataSource,
  windows,
  onGo,
  onCompare,
  onMoreDetails,
  detailsOpen,
}: ResultsCardProps) {
  const headingId = useId();
  // "Show more" appears only when there are more than three windows, and opens the rest in place.
  const [expanded, setExpanded] = useState(false);
  const more = (windows?.length ?? 0) > SHOWN_WINDOWS;
  const shown = expanded ? (windows ?? []) : (windows?.slice(0, SHOWN_WINDOWS) ?? []);

  return (
    <article className={styles.card} aria-labelledby={headingId}>
      <h3 id={headingId} className={styles.name}>
        {name} <span className={styles.meta}>· {meta}</span>
      </h3>
      <p className={joinClassNames(styles.verdict, assessment.suitable ? styles.ok : styles.fail)}>
        {verdictText(assessment, mission)}
      </p>

      <CheckTiles assessment={assessment} mission={mission} />

      <section className={styles.dates} aria-labelledby={`${headingId}-dates`}>
        <h4 id={`${headingId}-dates`} className={styles.datesTitle}>
          Other recommended dates
        </h4>
        {windows === null ? (
          <p className={styles.note}>Working out…</p>
        ) : shown.length === 0 ? (
          <p className={styles.note}>No good dates found ahead</p>
        ) : (
          <ol className={styles.windowList}>
            {shown.map((window) => (
              <li key={window.start} className={styles.windowRow}>
                <span className={styles.windowText}>
                  {formatDayMonth(window.start)} – {formatDayMonth(window.end)} ·{' '}
                  {tenthsOfDayDown(window.days)} days
                </span>
                <button
                  type="button"
                  className={styles.go}
                  aria-label={`Go to ${formatDayMonth(window.start)} – ${formatDayMonth(window.end)}`}
                  onClick={() => onGo(window)}
                >
                  Go
                </button>
              </li>
            ))}
          </ol>
        )}
        {more ? (
          <button
            type="button"
            className={styles.more}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Show fewer' : 'Show more'}
          </button>
        ) : null}
      </section>

      <div className={styles.actions}>
        <button type="button" className={styles.action} onClick={onCompare}>
          Compare with another location
        </button>
        <button
          type="button"
          className={styles.action}
          aria-expanded={detailsOpen}
          onClick={onMoreDetails}
        >
          More details ›
        </button>
      </div>
      <p className={styles.data}>{DATA_TEXT[dataSource]}</p>
    </article>
  );
}
