import { useId, useMemo, type ReactNode } from 'react';
import { formatDays, type DemoMission, type SkyAssessment } from '../../data/demoData';
import { siteSamples, type HorizonsSeries } from '../../services/horizonsData';
import { findLander } from '../../services/landers';
import type { YearFact } from '../../types/yearFact';
import type { LatLon } from '../../utils/lunarSky';
import { bodyNow, type PositionSamples } from '../../utils/riseSet';
import { formatCoordinate } from '../../utils/selenographic';
import { longestDarkHours } from '../../utils/skyVisibility';
import type { HorizonProfile } from '../../utils/terrainShadow';
import { formatWindowRange, type TimeRange } from '../../utils/time';
import { ElevationLine } from './ElevationLine';
import { HorizonView } from './HorizonView';
import { NightSurvival } from './NightSurvival';
import { PowerCheck } from './PowerCheck';
import { WindowBar } from './WindowBar';
import { YearFacts } from './YearFacts';
import styles from './DetailsPanel.module.css';

export type DetailsSection = 'spot' | 'year' | 'window' | 'power' | 'path' | 'share';

interface DetailsPanelProps {
  id: string;
  kind: 'site' | 'point';
  place: LatLon;
  /** A past landing's team note ("why here"), or null for a point. */
  why: string | null;
  /** A point's nearest past landing, as a line, or null. */
  nearest: string | null;
  assessment: SkyAssessment;
  mission: DemoMission;
  time: number;
  /** The step 3 dates. */
  range: TimeRange;
  terrain: HorizonProfile | null;
  series: HorizonsSeries | null;
  positions: PositionSamples | null;
  /** The year's rows with values (rows still unavailable are left out). */
  yearFacts: readonly YearFact[];
  landerId: string | null;
  /** "Design your own battery →": opens the Moon Power Lab pop-up. */
  onDesignBattery: () => void;
  horizonsLinks: { sun: string; earth: string } | null;
  share: { onShare: () => void; note: string | null };
  open: DetailsSection | null;
  onOpen: (section: DetailsSection | null) => void;
  onClose: () => void;
}

/**
 * "More details", beside the wizard: everything the Results card leaves out, one section open at
 * a time, all closed at first. It may scroll; the wizard does not.
 */
export function DetailsPanel({
  id,
  kind,
  place,
  why,
  nearest,
  assessment,
  mission,
  time,
  range,
  terrain,
  series,
  positions,
  yearFacts,
  landerId,
  onDesignBattery,
  horizonsLinks,
  share,
  open,
  onOpen,
  onClose,
}: DetailsPanelProps) {
  const headingId = useId();
  const sun = useMemo(() => bodyNow(place, 'sun', time, { positions }), [place, time, positions]);
  const earth = useMemo(
    () => bodyNow(place, 'earth', time, { positions }),
    [place, time, positions],
  );
  // The longest darkness in the step 3 dates, worked out only while "Power & battery" is open.
  const dark = useMemo(
    () =>
      open === 'power'
        ? longestDarkHours(siteSamples(series, place, range).samples, place, range)
        : null,
    [open, series, place, range],
  );
  const { sky, bestWindow } = assessment;

  const section = (key: DetailsSection, title: string, body: ReactNode) => {
    const expanded = open === key;
    return (
      <section key={key} className={styles.section}>
        <h3 className={styles.sectionHead}>
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={expanded}
            aria-controls={`${id}-${key}`}
            onClick={() => onOpen(expanded ? null : key)}
          >
            {title}
            <span className={styles.caret} aria-hidden="true">
              {expanded ? '−' : '+'}
            </span>
          </button>
        </h3>
        <div id={`${id}-${key}`} className={styles.body} hidden={!expanded}>
          {expanded ? body : null}
        </div>
      </section>
    );
  };

  return (
    <aside id={id} className={styles.panel} aria-labelledby={headingId}>
      <header className={styles.head}>
        <h2 id={headingId} className={styles.title}>
          More details
        </h2>
        <button type="button" className={styles.close} aria-label="Close details" onClick={onClose}>
          ✕
        </button>
      </header>

      {section(
        'spot',
        'This spot',
        <>
          <p className={styles.line}>{formatCoordinate(place, 4)}</p>
          <ElevationLine place={place} />
          {why ? <p className={styles.line}>Why here: {why}</p> : null}
          {nearest ? <p className={styles.line}>{nearest}</p> : null}
        </>,
      )}
      {yearFacts.length > 0
        ? section('year', 'Sun and Earth over the year', <YearFacts facts={yearFacts} />)
        : null}
      {section(
        'window',
        'Best window',
        <>
          <p className={styles.line}>
            {bestWindow ? formatWindowRange(bestWindow) : 'None in these dates'}
          </p>
          <WindowBar windows={sky.windows} time={time} range={range} />
          <dl className={styles.facts}>
            <dt>Longest sunlit stretch</dt>
            <dd>{formatDays(sky.longestSunlitDays)}</dd>
            {mission.hasRelay ? null : (
              <>
                <dt>Longest Sun + Earth stretch</dt>
                <dd>{formatDays(sky.longestWindowDays)}</dd>
              </>
            )}
          </dl>
        </>,
      )}
      {section(
        'power',
        'Power & battery',
        <>
          <p className={styles.note}>Information only: does not change pass/fail.</p>
          <PowerCheck
            place={place}
            range={range}
            sunHeightDeg={sun.elevationDeg}
            series={series}
            onDesign={onDesignBattery}
          />
          {landerId !== null && dark ? (
            <NightSurvival lander={findLander(landerId)} dark={dark} />
          ) : null}
        </>,
      )}
      {section(
        'path',
        'Sky chart: where the Sun and Earth move',
        <>
          <HorizonView
            place={place}
            range={range}
            sun={sun}
            earth={earth}
            minSunElevationDeg={mission.minSunElevationDeg}
            terrain={terrain}
            kind={kind}
            series={series}
          />
          {horizonsLinks ? (
            <p className={styles.line}>
              Open in JPL Horizons:{' '}
              <a href={horizonsLinks.sun} target="_blank" rel="noopener noreferrer">
                Sun
              </a>{' '}
              ·{' '}
              <a href={horizonsLinks.earth} target="_blank" rel="noopener noreferrer">
                Earth
              </a>
            </p>
          ) : null}
        </>,
      )}
      {section(
        'share',
        'Share',
        <>
          <button type="button" className={styles.go} onClick={share.onShare}>
            Copy a link to these results
          </button>
          <p className={styles.note} role="status">
            {share.note}
          </p>
        </>,
      )}

      <p className={styles.foot}>Earth in view does not guarantee a radio link.</p>
    </aside>
  );
}
