import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { StatusTag } from '../../components/StatusTag';
import { compareVerdict } from '../../data/compareVerdict';
import {
  formatDays,
  formatShare,
  type CheckId,
  type DemoMission,
  type RankedSite,
} from '../../data/demoData';
import { formatNeedsMet, needsMet } from '../../data/needsMet';
import type { HorizonsSeries } from '../../services/horizonsData';
import type { YearFact } from '../../types/yearFact';
import { joinClassNames } from '../../utils/classNames';
import { SOUTH_POLE, formatKm, haversineKm } from '../../utils/distance';
import {
  bodyNow,
  forecastText,
  type BodyNow,
  type PositionSamples,
  type SkyBody,
} from '../../utils/riseSet';
import {
  formatWindowLength,
  formatWindowRange,
  rangeWords,
  type TimeRange,
} from '../../utils/time';
import type { HorizonProfile } from '../../utils/terrainShadow';
import type { BracketDates } from './bracket';
import { CompareTimeline } from './CompareTimeline';
import styles from './ComparePanel.module.css';

interface ComparePanelProps {
  id: string;
  /** The picked sites, in pick order, from the same checks as the list. */
  entries: readonly RankedSite[];
  mission: DemoMission;
  /** The app's shared time (UTC ms): the "Now" rows are for this moment. */
  time: number;
  /** The checked month: a best window that runs past it also says how much is inside. */
  range: TimeRange;
  compareMax: number;
  onRemove: (siteId: string) => void;
  onClear: () => void;
  onClose: () => void;
  onSelectSite: (siteId: string) => void;
  /** A site's own positions (JPL Horizons) for the "Now" rows; null uses the engine. */
  positionsFor?: (siteId: string) => PositionSamples | null;
  /** A site's light, water and Earth over the year, each with its tag and source. */
  yearFactsFor?: (siteId: string) => readonly YearFact[];
  /**
   * The Timeline tab (docs/LANDER_RULES.md, "Timeline"): each site's positions and terrain, and
   * what to do when the bracket moves the dates. Without it there is no Timeline tab.
   */
  timeline?: {
    seriesFor: (siteId: string) => HorizonsSeries | null;
    terrainFor: (siteId: string) => HorizonProfile | null;
    /** The range the bracket shows (the dates checked, not deferred). */
    range: TimeRange;
    /** Whether the dates were picked (else the time bar's 29.5 days). */
    picked: boolean;
    onMove: (dates: BracketDates) => void;
  };
  className?: string;
}

const NO_POSITIONS = () => null;
const NO_FACTS = (): readonly YearFact[] => [];

/** "1,234 h". */
function hours(value: number): string {
  return `${value.toLocaleString('en-US')} h`;
}

/**
 * The best column in a row: the highest value among suitable sites, ties by name (as the Sites
 * list). Empty when fewer than two sites can be compared; also empty when they all tie, unless
 * `always` (the usable window, whose "Best" is the Sites list's best even on a tie).
 */
function bestOf(
  entries: readonly RankedSite[],
  value: (entry: RankedSite) => number | null,
  always = false,
): ReadonlySet<string> {
  const scored = entries
    .filter((entry) => entry.assessment.suitable)
    .map((entry) => ({ id: entry.site.id, name: entry.site.name, value: value(entry) }))
    .filter((item): item is { id: string; name: string; value: number } => item.value !== null);
  if (scored.length < 2) return new Set();
  const top = Math.max(...scored.map((item) => item.value));
  const winners = scored
    .filter((item) => Math.abs(item.value - top) < 1e-9)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!always && winners.length === scored.length) return new Set();
  return new Set(winners.slice(0, 1).map((item) => item.id));
}

/** "12° up · Forecast: dark in 2 d 4 h", or "below the horizon · Forecast: Earth rises in 5 d 2 h". */
function nowText(body: SkyBody, now: BodyNow, time: number): string {
  const where = now.up ? `${Math.round(now.elevationDeg)}° up` : 'below the horizon';
  if (!now.next) return `${where} · does not ${now.up ? 'set' : 'rise'} in the next 32 days`;
  return `${where} · ${forecastText(body, now.next, time)}`;
}

/** A row's name and, under it, what it measures (docs/LANDER_RULES.md, "The checks"). */
function rowName(label: string, measures: string): ReactNode {
  return (
    <>
      {label}
      <span className={styles.sub}>{measures}</span>
    </>
  );
}

/** "Best" as a word on the cell, so the highlight never rests on colour alone. */
function BestMark() {
  return <span className={styles.bestMark}>Best</span>;
}

/**
 * Picked sites side by side: one column per site, one row per question (power, comms, windows,
 * the Sun and Earth now), the best value in a row marked. It reads only what the checks already
 * worked out and the real Sun and Earth at the time bar's moment.
 */
export function ComparePanel({
  id,
  entries,
  mission,
  time,
  range,
  compareMax,
  onRemove,
  onClear,
  onClose,
  onSelectSite,
  positionsFor = NO_POSITIONS,
  yearFactsFor = NO_FACTS,
  timeline,
  className,
}: ComparePanelProps) {
  const [view, setView] = useState<'table' | 'timeline'>('table');
  const showTimeline = view === 'timeline' && timeline !== undefined;
  const verdict = compareVerdict(entries, range);
  const words = rangeWords(range);
  const now = useMemo(
    () =>
      new Map(
        entries.map((entry) => {
          const positions = positionsFor(entry.site.id);
          return [
            entry.site.id,
            {
              sun: bodyNow(entry.site, 'sun', time, { positions }),
              earth: bodyNow(entry.site, 'earth', time, { positions }),
            },
          ];
        }),
      ),
    [entries, time, positionsFor],
  );

  const best = {
    // The usable window's best is the Sites list's best: the longest usable window.
    window: bestOf(entries, (entry) => entry.assessment.usableDays, true),
    power: bestOf(entries, (entry) => entry.assessment.sky.longestSunlitDays),
    sunlight: bestOf(entries, (entry) => entry.assessment.sky.sunPct),
    earth: bestOf(entries, (entry) => entry.assessment.sky.earthPct),
    sunHours: bestOf(entries, (entry) => entry.assessment.sky.sunHours),
    earthHours: bestOf(entries, (entry) => entry.assessment.sky.earthHours),
    bothHours: bestOf(entries, (entry) => entry.assessment.sky.bothHours),
  };

  const row = (label: ReactNode, cell: (entry: RankedSite) => ReactNode, key: string) => (
    <tr key={key}>
      <th scope="row" className={styles.rowHead}>
        {label}
      </th>
      {entries.map((entry) => (
        <td key={entry.site.id} className={styles.cell}>
          {cell(entry)}
        </td>
      ))}
    </tr>
  );

  const bestCell = (winners: ReadonlySet<string>, entry: RankedSite, content: ReactNode) => {
    const isBest = winners.has(entry.site.id);
    return (
      <div className={joinClassNames(styles.value, isBest && styles.best)}>
        {content}
        {isBest ? <BestMark /> : null}
      </div>
    );
  };

  return (
    <section
      id={id}
      className={joinClassNames(styles.panel, className)}
      aria-labelledby={`${id}-title`}
    >
      <header className={styles.head}>
        <h2 id={`${id}-title`} className={styles.title}>
          Compare sites
        </h2>
        <span className={styles.count}>
          {entries.length} of {compareMax}
        </span>
        <div className={styles.actions}>
          {entries.length > 0 ? (
            <button type="button" className={styles.textButton} onClick={onClear}>
              Clear all
            </button>
          ) : null}
          <button
            type="button"
            className={styles.close}
            aria-label="Close compare"
            title="Close (Esc). Your picks are kept."
            onClick={onClose}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </header>

      {entries.length < 2 ? (
        <div className={styles.empty}>
          <EmptyState title="Nothing to compare yet">Pick two or more sites to compare.</EmptyState>
        </div>
      ) : (
        <>
          {verdict ? (
            <p className={styles.verdict} data-testid="compare-verdict" data-tour="compare-verdict">
              <span className={styles.verdictLabel}>Which one?</span> {verdict}{' '}
              <span className={styles.demo}>Based on DEMO mission needs</span>
            </p>
          ) : null}
          {timeline ? (
            <div className={styles.tabs} role="tablist" aria-label="Compare view">
              {(['table', 'timeline'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  id={`${id}-tab-${tab}`}
                  className={styles.tab}
                  aria-selected={view === tab}
                  aria-controls={`${id}-view`}
                  tabIndex={view === tab ? 0 : -1}
                  onClick={() => setView(tab)}
                  onKeyDown={(event) => {
                    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                    event.preventDefault();
                    const next = tab === 'table' ? 'timeline' : 'table';
                    setView(next);
                    document.getElementById(`${id}-tab-${next}`)?.focus();
                  }}
                >
                  {tab === 'table' ? 'Table' : 'Timeline'}
                </button>
              ))}
            </div>
          ) : null}
          {showTimeline ? (
            <div
              className={styles.scroll}
              id={`${id}-view`}
              role="tabpanel"
              aria-labelledby={`${id}-tab-timeline`}
            >
              <CompareTimeline
                entries={entries}
                mission={mission}
                range={timeline.range}
                picked={timeline.picked}
                seriesFor={timeline.seriesFor}
                terrainFor={timeline.terrainFor}
                onMove={timeline.onMove}
              />
            </div>
          ) : (
            <div
              className={styles.scroll}
              id={timeline ? `${id}-view` : undefined}
              role={timeline ? 'tabpanel' : undefined}
              aria-labelledby={timeline ? `${id}-tab-table` : undefined}
            >
              <table
                className={styles.table}
                // Each site column keeps its minimum width; more sites scroll sideways.
                style={{ '--columns': entries.length } as CSSProperties}
              >
                <caption className="visually-hidden">
                  {entries.length} sites compared for {mission.name}
                </caption>
                <thead>
                  <tr>
                    <td className={styles.corner}>
                      <span className={styles.demo}>DEMO needs</span>
                    </td>
                    {entries.map((entry) => (
                      <th key={entry.site.id} scope="col" className={styles.colHead}>
                        <button
                          type="button"
                          className={styles.siteButton}
                          title="Show on the map"
                          onClick={() => onSelectSite(entry.site.id)}
                        >
                          {entry.site.name}
                        </button>
                        <button
                          type="button"
                          className={styles.remove}
                          aria-label={`Remove ${entry.site.name}`}
                          onClick={() => onRemove(entry.site.id)}
                        >
                          Remove
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>{rows()}</tbody>
              </table>
              <ul className={styles.distances} aria-label="Distances between the compared sites">
                {entries.flatMap((a, i) =>
                  entries.slice(i + 1).map((b) => (
                    <li key={`${a.site.id}-${b.site.id}`}>
                      {a.site.name} to {b.site.name}: {formatKm(haversineKm(a.site, b.site))}
                    </li>
                  )),
                )}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );

  /** "OK" or "Fails", with the value behind it. */
  function gate(passes: boolean, detail: string) {
    return (
      <>
        <span className={joinClassNames(styles.gate, !passes && styles.fail)}>
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path
              d={passes ? 'M2.5 6.5 5 9l4.5-5.5' : 'M3 3l6 6M9 3l-6 6'}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {passes ? 'OK' : 'Fails'}
        </span>
        <span className={styles.sub}>{detail}</span>
      </>
    );
  }

  function checkCell(entry: RankedSite, id: CheckId, winners: ReadonlySet<string>) {
    const check = entry.assessment.checks.find((item) => item.id === id);
    return check ? bestCell(winners, entry, gate(check.passes, check.detail)) : null;
  }

  function rows() {
    return [
      row(
        rowName('Power', 'the Sun only'),
        (entry) => checkCell(entry, 'sunlight', best.power),
        'power',
      ),
      row(
        rowName('Comms', 'the Earth only'),
        (entry) => checkCell(entry, 'earth', best.earth),
        'comms',
      ),
      row(
        rowName(
          'Usable window',
          mission.hasRelay ? 'the Sun only (relay)' : 'the Sun and Earth both',
        ),
        (entry) => {
          // With a relay the usable window is the power stretch (no separate check).
          const check = entry.assessment.checks.find(
            (item) => item.id === (mission.hasRelay ? 'sunlight' : 'window'),
          );
          if (!check) return null;
          return bestCell(
            best.window,
            entry,
            gate(
              check.passes,
              `${formatDays(entry.assessment.usableDays)} ${words.within} (needs ${mission.daysNeeded})`,
            ),
          );
        },
        'usable',
      ),
      row(
        rowName('Mission needs met', `usable window ÷ ${mission.daysNeeded} d needed`),
        (entry) =>
          bestCell(
            best.window,
            entry,
            <span>{formatNeedsMet(needsMet(entry.assessment, mission), mission)}</span>,
          ),
        'needs',
      ),
      row(
        'Best window',
        (entry) => {
          const window = entry.assessment.bestWindow;
          return window ? (
            <div className={styles.value}>
              <span>{formatWindowRange(window)}</span>
              <span className={styles.sub}>{formatWindowLength(window, range)}</span>
            </div>
          ) : (
            <div className={styles.excluded}>None {words.within}</div>
          );
        },
        'window',
      ),
      row(
        rowName('Hours of Sun', `Sun at least ${mission.minSunElevationDeg}° up`),
        (entry) =>
          bestCell(best.sunHours, entry, <span>{hours(entry.assessment.sky.sunHours)}</span>),
        'sun-hours',
      ),
      row(
        rowName('Hours of Earth', `Earth at least ${mission.minEarthElevationDeg}° up`),
        (entry) =>
          bestCell(best.earthHours, entry, <span>{hours(entry.assessment.sky.earthHours)}</span>),
        'earth-hours',
      ),
      row(
        rowName('Hours of both', 'the Sun and Earth up at once'),
        (entry) =>
          bestCell(best.bothHours, entry, <span>{hours(entry.assessment.sky.bothHours)}</span>),
        'both-hours',
      ),
      row(
        rowName('From the south pole', 'haversine, R = 1737.4 km'),
        (entry) => (
          <div className={styles.value}>
            <span>
              {formatKm(haversineKm(entry.site, SOUTH_POLE))}
              <StatusTag>Calculated</StatusTag>
            </span>
          </div>
        ),
        'pole',
      ),
      ...(['light', 'water', 'earth'] as const).map((id) => {
        const label = entries
          .map((entry) => yearFactsFor(entry.site.id).find((fact) => fact.id === id)?.label)
          .find((text) => text !== undefined);
        return label
          ? row(
              label,
              (entry) => {
                const fact = yearFactsFor(entry.site.id).find((item) => item.id === id);
                return fact ? (
                  <div className={styles.value}>
                    <span>
                      {fact.value}
                      <StatusTag quiet={fact.status === 'Unavailable'}>{fact.status}</StatusTag>
                    </span>
                    <span className={styles.sub}>{fact.source}</span>
                  </div>
                ) : null;
              },
              `year-${id}`,
            )
          : null;
      }),
      row(
        'Sun up',
        (entry) =>
          bestCell(
            best.sunlight,
            entry,
            <span>
              {formatShare(entry.assessment.sky.sunPct)} {words.of}
            </span>,
          ),
        'sun-share',
      ),
      row(
        <>
          Now
          <span className={styles.sub}>at the time shown</span>
        </>,
        (entry) => {
          const sky = now.get(entry.site.id);
          if (!sky) return null;
          return (
            <div className={styles.value}>
              <span>Sun {nowText('sun', sky.sun, time)}</span>
              <span>Earth {nowText('earth', sky.earth, time)}</span>
            </div>
          );
        },
        'now',
      ),
    ];
  }
}
