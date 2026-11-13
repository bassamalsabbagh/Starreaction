import { useMemo, useState } from 'react';
import { Tooltip } from '../../components/Tooltip';
import { joinClassNames } from '../../utils/classNames';
import { describeElevation, lunarSky, subPoint } from '../../utils/lunarSky';
import { bodyNow, forecastText, type PositionSamples } from '../../utils/riseSet';
import { formatCoordinate } from '../../utils/selenographic';
import { formatAmman, formatClock } from '../../utils/time';
import { TimePopover } from './TimePopover';
import { useTime } from './timeContext';
import styles from './StatusStrip.module.css';

interface StatusStripProps {
  missionName: string;
  /** The selected site or point, whose sky the chips describe; null shows sub-points. */
  site: { name: string; lat: number; lon: number } | null;
  /** A fixed site's own positions (JPL Horizons), used where they have the time; else the engine. */
  positions?: PositionSamples | null;
  className?: string;
}

const ARROW = {
  viewBox: '0 0 12 12',
  width: 12,
  height: 12,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

/**
 * The status line above the timeline: the mission, the app time (click to set it), whether that
 * time is live or simulated, and where the real Sun and Earth stand in the selected place's sky,
 * with a forecast of when each next sets or rises ("Forecast: dark in 2 d 4 h").
 */
export function StatusStrip({ missionName, site, positions = null, className }: StatusStripProps) {
  const { time, mode, goLive, editorOpen, openEditor, closeEditor } = useTime();
  // The time editor opens above the clock: it is drawn at the page's top level and needs to know
  // where the clock is.
  const [clockWrap, setClockWrap] = useState<HTMLSpanElement | null>(null);
  const live = mode === 'live';
  const sky = useMemo(() => lunarSky(new Date(time)), [time]);
  const chips = site
    ? (['sun', 'earth'] as const).map((body) => {
        const now = bodyNow(site, body, time, { positions });
        const name = body === 'sun' ? 'Sun' : 'Earth';
        const next = now.next ? ` · ${forecastText(body, now.next, time)}` : '';
        return {
          key: name,
          up: now.up,
          text: `${describeElevation(name, now.elevationDeg)}${next}`,
        };
      })
    : [
        { key: 'Sun', text: `Sub-solar ${formatCoordinate(subPoint(sky.sun), 1)}` },
        { key: 'Earth', text: `Sub-Earth ${formatCoordinate(subPoint(sky.earth), 1)}` },
      ].map((chip) => ({ ...chip, up: null }));

  return (
    <div
      className={joinClassNames(styles.strip, className)}
      role="group"
      aria-label="Status"
      data-tour="status"
    >
      <span className={styles.lander}>{missionName}</span>

      <span className={joinClassNames(styles.mode, live ? styles.live : styles.simulated)}>
        <span className={styles.modeDot} aria-hidden="true" />
        {live ? 'Live' : 'Simulated'}
      </span>

      <span ref={setClockWrap} className={styles.clockWrap}>
        <Tooltip
          suppressed={editorOpen}
          content={
            <>
              {formatAmman(time)}
              <br />
              UTC is the standard time used for space missions.
            </>
          }
        >
          {(describedBy) => (
            <button
              type="button"
              className={styles.clock}
              aria-describedby={describedBy}
              aria-expanded={editorOpen}
              aria-haspopup="dialog"
              aria-label={`Time: ${formatClock(time)}. Change the time`}
              onClick={(event) => (editorOpen ? closeEditor() : openEditor(event.currentTarget))}
            >
              {formatClock(time)}
            </button>
          )}
        </Tooltip>
        {editorOpen ? <TimePopover anchor={clockWrap} /> : null}
      </span>

      {live ? null : (
        <button type="button" className={styles.now} onClick={goLive}>
          Now
        </button>
      )}

      <Tooltip
        content={
          site
            ? `Real Sun and Earth positions, above ${site.name}'s horizon on a smooth Moon (no terrain).`
            : 'Real Sun and Earth positions: the points they stand straight over.'
        }
        align="end"
      >
        {() => (
          <span className={styles.chips}>
            {chips.map(({ key, up, text }) => (
              <span
                key={key}
                className={joinClassNames(styles.chip, up === false && styles.chipDown)}
              >
                {up === null ? (
                  <span className={styles.chipDot} aria-hidden="true" />
                ) : (
                  <svg {...ARROW} className={styles.chipArrow}>
                    <path
                      d={
                        up
                          ? 'M6 10V2.5M2.75 5.5 6 2.25 9.25 5.5'
                          : 'M6 2v7.5M2.75 6.5 6 9.75 9.25 6.5'
                      }
                    />
                  </svg>
                )}
                {text}
              </span>
            ))}
            {/* The tooltip's caveat, for those who cannot hover it. */}
            <span className="visually-hidden">
              {site
                ? ' (real Sun and Earth, on a smooth Moon: no terrain)'
                : ' (real Sun and Earth)'}
            </span>
          </span>
        )}
      </Tooltip>
    </div>
  );
}
