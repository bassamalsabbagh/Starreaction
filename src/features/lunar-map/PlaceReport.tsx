import { useId, useMemo, useState, type ReactNode } from 'react';
import { Collapsible } from '../../components/Collapsible';
import { CompareToggle } from '../../components/CompareToggle';
import {
  formatDays,
  formatShare,
  verdictText,
  type DemoMission,
  type SkyAssessment,
} from '../../data/demoData';
import { formatNeedsMet, needsMet } from '../../data/needsMet';
import { joinClassNames } from '../../utils/classNames';
import type { LatLon } from '../../utils/lunarSky';
import { bodyNow, type BodyNow } from '../../utils/riseSet';
import type { HorizonProfile } from '../../utils/terrainShadow';
import {
  formatDuration,
  formatWindowLength,
  formatWindowRange,
  type TimeRange,
} from '../../utils/time';
import { HorizonView } from './HorizonView';
import { ElevationLine } from './ElevationLine';
import { OtherDates } from './OtherDates';
import type { ElevationState } from './useElevationGrid';
import { PowerCheck } from './PowerCheck';
import { WindowBar } from './WindowBar';
import styles from './PlaceReport.module.css';

interface PlaceReportProps {
  /** The view's title: "Site details" for a site, "Anywhere on the Moon" for a picked point. */
  heading: string;
  /** What the place is called: a site's name, or a point's coordinates. */
  name: string;
  /** The line under the name (coordinates, or the nearest demo site). */
  meta: ReactNode;
  /** The site's place in the list, when it is a suitable site. */
  rank?: number | null;
  place: LatLon;
  assessment: SkyAssessment;
  mission: DemoMission;
  time: number;
  range: TimeRange;
  /** The terrain skyline around the place, when elevation data is loaded for it. */
  terrain: HorizonProfile | null;
  /** The south-pole elevation data (its height and slope here, or why there is none). */
  elevation: ElevationState;
  /** Moves the app's time (Other dates' "Go"). */
  onSetTime: (ms: number) => void;
  /** A new number opens Other dates (the guided demo). */
  revealOtherDates?: number;
  /** Picks or unpicks the site for comparing (sites only). */
  compare?: { picked: boolean; full: boolean; onToggle: () => void };
  share: { onShare: () => void; note: string | null };
  onBack: () => void;
}

/** "sets in 2d 4h", "rises in 5d 2h", or that it does neither within the search. */
function nextText(body: BodyNow, time: number): string {
  if (!body.next)
    return body.up ? 'does not set in the next 32 days' : 'does not rise in the next 32 days';
  return `${body.next.kind === 'set' ? 'sets' : 'rises'} in ${formatDuration(body.next.at - time)}`;
}

/**
 * The card for a place, a demo site or any point: does the mission get power and comms here; the
 * Sun and Earth now, with the time left before each sets; the horizon view; the best window and
 * the month's numbers; the checks; other dates; Compare and Share. Every number comes from the
 * real Sun and Earth over the time bar's month, against the mission's (DEMO) needs.
 */
export function PlaceReport({
  heading,
  name,
  meta,
  rank = null,
  place,
  assessment,
  mission,
  time,
  range,
  terrain,
  elevation,
  onSetTime,
  revealOtherDates = 0,
  compare,
  share,
  onBack,
}: PlaceReportProps) {
  const headingId = useId();
  const [methodOpen, setMethodOpen] = useState(false);
  const sun = useMemo(() => bodyNow(place, 'sun', time), [place, time]);
  const earth = useMemo(() => bodyNow(place, 'earth', time), [place, time]);
  const { sky, bestWindow } = assessment;

  const nowCell = (label: string, body: BodyNow, note: string) => (
    <div className={styles.nowCell}>
      <dt>{label}</dt>
      <dd>
        <span className={styles.nowValue}>
          {body.up ? `${Math.round(body.elevationDeg)}°` : 'Down'}
        </span>
        <span className={styles.nowNote}>
          {body.up ? note : 'below the horizon'} · {nextText(body, time)}
        </span>
      </dd>
    </div>
  );

  return (
    <aside className={styles.panel} aria-labelledby={headingId} data-tour="details">
      <div className={styles.viewHeader}>
        <button type="button" className={styles.back} onClick={onBack}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path
              d="M10 3.5L5.5 8l4.5 4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          All sites
        </button>
        <h2 id={headingId} className={styles.viewTitle}>
          {heading}
        </h2>
      </div>

      <div className={styles.header}>
        <div className={styles.nameRow}>
          <h3 className={styles.name}>{name}</h3>
          {rank !== null ? <span className={styles.rank}>#{rank}</span> : null}
        </div>
        <p className={styles.meta}>{meta}</p>
        <ElevationLine place={place} elevation={elevation} />
      </div>

      <p
        className={joinClassNames(styles.verdict, assessment.suitable ? styles.ok : styles.fail)}
        data-tour="why"
      >
        <span className={styles.verdictDot} aria-hidden="true" />
        {verdictText(assessment, mission)}
      </p>

      <div role="group" aria-label="The Sun and Earth now" data-tour="now">
        <dl className={styles.now}>
          {nowCell('Sun · power', sun, 'solar elevation')}
          {nowCell('Earth · comms', earth, 'above the horizon')}
        </dl>
      </div>

      <HorizonView
        place={place}
        range={range}
        sun={sun}
        earth={earth}
        minSunElevationDeg={mission.minSunElevationDeg}
        terrain={terrain}
      />

      <div className={styles.windowBlock}>
        <p className={styles.window}>
          <span className={styles.windowLabel}>Best window</span>{' '}
          {bestWindow
            ? `${formatWindowRange(bestWindow)} · ${formatWindowLength(bestWindow, range)}`
            : 'None in this month'}
        </p>
        <WindowBar windows={sky.windows} time={time} range={range} />
      </div>

      <div role="group" aria-label="This month">
        <dl className={styles.facts}>
          <div>
            <dt>Sun up</dt>
            <dd>{formatShare(sky.sunPct)} of the month</dd>
          </div>
          <div>
            <dt>Longest sunlit stretch</dt>
            <dd>{formatDays(sky.longestSunlitDays)}</dd>
          </div>
          <div>
            <dt>Earth up</dt>
            <dd>{formatShare(sky.earthPct)} of the month</dd>
          </div>
          <div>
            <dt>
              {mission.hasRelay ? 'Longest power window' : 'Longest Sun + Earth window'} this month
            </dt>
            <dd>{formatDays(assessment.usableDays)}</dd>
          </div>
          <div>
            <dt>Mission needs met</dt>
            <dd>{formatNeedsMet(needsMet(assessment, mission), mission)}</dd>
          </div>
        </dl>
      </div>

      <ul className={styles.checks} aria-label={`Checks for ${mission.name}`}>
        {assessment.checks.map((check) => (
          <li key={check.id} className={styles.check}>
            <span className={styles.checkName}>{check.label}</span>
            <span
              className={joinClassNames(styles.checkWord, check.passes ? styles.ok : styles.fail)}
            >
              {check.passes ? 'OK' : 'Fails'}
            </span>
            <span className={styles.checkDetail}>{check.detail}</span>
          </li>
        ))}
      </ul>

      <div data-tour="other-dates">
        <OtherDates
          place={place}
          mission={mission}
          time={time}
          terrain={terrain}
          onGo={onSetTime}
          revealSeq={revealOtherDates}
        />
      </div>

      <PowerCheck place={place} range={range} sunHeightDeg={sun.elevationDeg} />

      <div className={styles.actions}>
        {compare ? (
          <CompareToggle
            siteName={name}
            picked={compare.picked}
            full={compare.full}
            onToggle={compare.onToggle}
            variant="text"
          />
        ) : null}
        <button type="button" className={styles.action} onClick={share.onShare}>
          Share
        </button>
      </div>
      <p className={styles.shareNote} role="status">
        {share.note}
      </p>

      <Collapsible
        title="How this is worked out"
        open={methodOpen}
        onToggle={() => setMethodOpen(!methodOpen)}
      >
        <p className={styles.note}>
          The Sun and Earth are real: their positions come from astronomy-engine, checked against
          NASA/JPL Horizons, sampled every hour over the time bar&apos;s 29.5 days. Heights are
          above a smooth Moon, so crater rims and hills are not counted yet. The sites and the
          mission&apos;s needs are <span className={styles.demo}>DEMO</span> (made up); sources are
          in About → Data and credits.
        </p>
      </Collapsible>
    </aside>
  );
}
