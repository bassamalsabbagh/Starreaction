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
import { POWER_SLIDERS } from '../../data/powerCheck';
import { siteHourlySky, type HorizonsSeries } from '../../services/horizonsData';
import { findLander } from '../../services/landers';
import { joinClassNames } from '../../utils/classNames';
import type { LatLon } from '../../utils/lunarSky';
import { bodyNow, forecastText, type BodyNow, type SkyBody } from '../../utils/riseSet';
import { longestDarkHours } from '../../utils/skyVisibility';
import type { HorizonProfile } from '../../utils/terrainShadow';
import {
  formatWindowLength,
  formatWindowRange,
  rangeWords,
  type TimeRange,
} from '../../utils/time';
import { HorizonView } from './HorizonView';
import { positionsOf } from './horizonsPositions';
import { ElevationLine } from './ElevationLine';
import { OtherDates } from './OtherDates';
import { NightSurvival } from './NightSurvival';
import { PowerCheck } from './PowerCheck';
import { WindowBar } from './WindowBar';
import styles from './PlaceReport.module.css';

interface PlaceReportProps {
  /** The view's title: "Site details" for a site, "Anywhere on the Moon" for a picked point. */
  heading: string;
  /** A landing site or a picked point (the horizon view names it: "no terrain data for this site"). */
  kind: 'site' | 'point';
  /** What the place is called: a site's name, or a point's coordinates. */
  name: string;
  /** The line under the name (the site's region, or the nearest landing site). */
  meta: ReactNode;
  /** A site's own record (why, coordinates, landing date, outcomes), under the name. */
  facts?: ReactNode;
  /** The site's place in the list, when it is a suitable site. */
  rank?: number | null;
  place: LatLon;
  assessment: SkyAssessment;
  mission: DemoMission;
  time: number;
  range: TimeRange;
  /** The terrain skyline around the place, when elevation data is loaded for it. */
  terrain: HorizonProfile | null;
  /**
   * A fixed site's JPL Horizons positions: the hourly checks' samples, "now" and the next set or
   * rise come from them where they have data. Null for points (the engine).
   */
  series?: HorizonsSeries | null;
  /** Where the positions came from ("Sun and Earth positions: JPL Horizons"). */
  positionsLabel: string;
  /** "View in JPL Horizons": the same query for the Sun and the Earth, opened in a new tab. */
  horizonsLinks?: { sun: string; earth: string } | null;
  /** A landing site's lander (data/landers.json id): the night-survival block. None for points. */
  landerId?: string | null;
  /** Moves the app's time (Other dates' "Go"). */
  onSetTime: (ms: number) => void;
  /** A new number opens Other dates (the guided demo). */
  revealOtherDates?: number;
  /** Picks or unpicks the site for comparing (sites only). */
  compare?: { picked: boolean; full: boolean; onToggle: () => void };
  share: { onShare: () => void; note: string | null };
  onBack: () => void;
}

/** "Forecast: dark in 2 d 4 h", "Forecast: Earth rises in 5 d 2 h", or that it does neither. */
function nextText(which: SkyBody, body: BodyNow, time: number): string {
  if (!body.next)
    return body.up ? 'does not set in the next 32 days' : 'does not rise in the next 32 days';
  return forecastText(which, body.next, time);
}

/** Under Comms, once: what Earth in view does and does not promise. */
const COMMS_NOTE =
  'Earth in view means a direct link is geometrically possible; it does not guarantee the radio link works.';

/**
 * The card for a place, a landing site or any point: does the mission get power and comms here;
 * the Sun and Earth now, with a forecast of when each sets or rises; the horizon view; the best
 * window and the range's numbers; the checks; other dates; Compare and Share. Every number comes
 * from the real Sun and Earth over the range being checked, against the mission's needs (DEMO
 * unless the user made the mission).
 */
export function PlaceReport({
  heading,
  kind,
  name,
  meta,
  facts,
  rank = null,
  place,
  assessment,
  mission,
  time,
  range,
  terrain,
  series = null,
  positionsLabel,
  horizonsLinks = null,
  landerId = null,
  onSetTime,
  revealOtherDates = 0,
  compare,
  share,
  onBack,
}: PlaceReportProps) {
  const headingId = useId();
  const [methodOpen, setMethodOpen] = useState(false);
  const positions = useMemo(() => positionsOf(series), [series]);
  const sun = useMemo(() => bodyNow(place, 'sun', time, { positions }), [place, time, positions]);
  const earth = useMemo(
    () => bodyNow(place, 'earth', time, { positions }),
    [place, time, positions],
  );
  const { sky, bestWindow } = assessment;
  const words = rangeWords(range);
  // The Power check's heater slider, shared with "Battery needed here" in Night survival.
  const [nightLoadW, setNightLoadW] = useState<number>(POWER_SLIDERS.heaterW.initial);
  // The longest darkness at a site in the checked range: the same night the Power check uses.
  const dark = useMemo(
    () =>
      landerId === null
        ? null
        : longestDarkHours(siteHourlySky(series, place, range).samples, place, range),
    [landerId, series, place, range],
  );

  const nowCell = (label: string, which: SkyBody, body: BodyNow, note: string) => (
    <div className={styles.nowCell}>
      <dt>{label}</dt>
      <dd>
        <span className={styles.nowValue}>
          {body.up ? `${Math.round(body.elevationDeg)}°` : 'Down'}
        </span>
        <span className={styles.nowNote}>
          {body.up ? note : 'below the horizon'} · {nextText(which, body, time)}
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
        <ElevationLine place={place} />
      </div>

      {facts}

      <p
        className={joinClassNames(styles.verdict, assessment.suitable ? styles.ok : styles.fail)}
        data-tour="why"
      >
        <span className={styles.verdictDot} aria-hidden="true" />
        {verdictText(assessment, mission)}
      </p>

      <div role="group" aria-label="The Sun and Earth now" data-tour="now">
        <dl className={styles.now}>
          {nowCell('Sun · power', 'sun', sun, 'solar elevation')}
          {nowCell('Earth · comms', 'earth', earth, 'above the horizon')}
        </dl>
      </div>

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

      <div className={styles.positions}>
        <p className={styles.positionsLabel} data-testid="positions-label">
          {positionsLabel}
        </p>
        {horizonsLinks ? (
          <p className={styles.positionsLinks}>
            View in JPL Horizons:{' '}
            <a
              href={horizonsLinks.sun}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View the Sun in JPL Horizons (opens in a new tab)"
            >
              Sun
            </a>{' '}
            ·{' '}
            <a
              href={horizonsLinks.earth}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View the Earth in JPL Horizons (opens in a new tab)"
            >
              Earth
            </a>
          </p>
        ) : null}
      </div>

      <div className={styles.windowBlock}>
        <p className={styles.window}>
          <span className={styles.windowLabel}>Best window</span>{' '}
          {bestWindow
            ? `${formatWindowRange(bestWindow)} · ${formatWindowLength(bestWindow, range)}`
            : `None ${words.within}`}
        </p>
        <WindowBar windows={sky.windows} time={time} range={range} />
      </div>

      <div role="group" aria-label={words.title}>
        <dl className={styles.facts}>
          <div>
            <dt>Sun up</dt>
            <dd>
              {formatShare(sky.sunPct)} {words.of}
            </dd>
          </div>
          <div>
            <dt>Longest sunlit stretch</dt>
            <dd>{formatDays(sky.longestSunlitDays)}</dd>
          </div>
          <div>
            <dt>Earth up</dt>
            <dd>
              {formatShare(sky.earthPct)} {words.of}
            </dd>
          </div>
          <div>
            <dt>
              {mission.hasRelay ? 'Longest power window' : 'Longest Sun + Earth window'} {words.now}
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
            {check.id === 'earth' ? <span className={styles.checkNote}>{COMMS_NOTE}</span> : null}
          </li>
        ))}
      </ul>

      <div data-tour="other-dates">
        <OtherDates
          place={place}
          mission={mission}
          time={time}
          terrain={terrain}
          series={series}
          onGo={onSetTime}
          revealSeq={revealOtherDates}
        />
      </div>

      <PowerCheck
        place={place}
        range={range}
        sunHeightDeg={sun.elevationDeg}
        series={series}
        heater={{ watts: nightLoadW, onChange: setNightLoadW }}
      />

      {landerId !== null && dark ? (
        <NightSurvival
          lander={findLander(landerId)}
          dark={dark}
          loadW={nightLoadW}
          within={words.within}
        />
      ) : null}

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
          The Sun and Earth are real. {positionsLabel}. They are sampled every hour over the range
          being checked: the time bar&apos;s 29.5 days, or the dates picked in the Mission view.
          Heights are above a smooth Moon, so crater rims and hills are not counted yet. The landing
          sites are real; the demo missions&apos; needs are{' '}
          <span className={styles.demo}>DEMO</span> (made up for practice). Sources are in About →
          Data and credits.
        </p>
      </Collapsible>
    </aside>
  );
}
