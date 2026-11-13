import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { compareVerdict } from '../../data/compareVerdict';
import {
  formatDays,
  formatShare,
  type CheckId,
  type DemoMission,
  type RankedDemoSite,
} from '../../data/demoData';
import { formatNeedsMet, needsMet } from '../../data/needsMet';
import { joinClassNames } from '../../utils/classNames';
import { bodyNow, type BodyNow } from '../../utils/riseSet';
import {
  formatDuration,
  formatWindowLength,
  formatWindowRange,
  type TimeRange,
} from '../../utils/time';
import styles from './ComparePanel.module.css';

interface ComparePanelProps {
  id: string;
  /** The picked sites, in pick order, from the same checks as the list. */
  entries: readonly RankedDemoSite[];
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
  className?: string;
}

/**
 * The ids of the best column in a row: the highest value among suitable sites. Empty when fewer
 * than two sites can be compared or they all tie, so "Best" always means something.
 */
function bestOf(
  entries: readonly RankedDemoSite[],
  value: (entry: RankedDemoSite) => number | null,
): ReadonlySet<string> {
  const scored = entries
    .filter((entry) => entry.assessment.suitable)
    .map((entry) => ({ id: entry.site.id, value: value(entry) }))
    .filter((item): item is { id: string; value: number } => item.value !== null);
  if (scored.length < 2) return new Set();
  const top = Math.max(...scored.map((item) => item.value));
  const winners = scored.filter((item) => Math.abs(item.value - top) < 1e-9);
  return winners.length === scored.length ? new Set() : new Set(winners.map((item) => item.id));
}

/** "12° up · sets in 2d 4h", or "below horizon · rises in 5d 2h". */
function nowText(now: BodyNow, time: number): string {
  const where = now.up ? `${Math.round(now.elevationDeg)}° up` : 'below the horizon';
  if (!now.next) return `${where} · does not ${now.up ? 'set' : 'rise'} in the next 32 days`;
  return `${where} · ${now.next.kind === 'set' ? 'sets' : 'rises'} in ${formatDuration(now.next.at - time)}`;
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
  className,
}: ComparePanelProps) {
  const verdict = compareVerdict(entries);
  const now = useMemo(
    () =>
      new Map(
        entries.map((entry) => [
          entry.site.id,
          { sun: bodyNow(entry.site, 'sun', time), earth: bodyNow(entry.site, 'earth', time) },
        ]),
      ),
    [entries, time],
  );

  const best = {
    // The usable window's best is the Sites list's best: the longest usable window.
    window: bestOf(entries, (entry) => entry.assessment.usableDays),
    power: bestOf(entries, (entry) => entry.assessment.sky.longestSunlitDays),
    sunlight: bestOf(entries, (entry) => entry.assessment.sky.sunPct),
    earth: bestOf(entries, (entry) => entry.assessment.sky.earthPct),
  };

  const row = (label: ReactNode, cell: (entry: RankedDemoSite) => ReactNode, key: string) => (
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

  const bestCell = (winners: ReadonlySet<string>, entry: RankedDemoSite, content: ReactNode) => {
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
              <span className={styles.demo}>Based on DEMO data</span>
            </p>
          ) : null}
          <div className={styles.scroll}>
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
                    <span className={styles.demo}>DEMO sites</span>
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
          </div>
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

  function checkCell(entry: RankedDemoSite, id: CheckId, winners: ReadonlySet<string>) {
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
              `${formatDays(entry.assessment.usableDays)} in this month (needs ${mission.daysNeeded})`,
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
            <div className={styles.excluded}>None in this month</div>
          );
        },
        'window',
      ),
      row(
        'Sun up',
        (entry) =>
          bestCell(
            best.sunlight,
            entry,
            <span>{formatShare(entry.assessment.sky.sunPct)} of the month</span>,
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
              <span>Sun {nowText(sky.sun, time)}</span>
              <span>Earth {nowText(sky.earth, time)}</span>
            </div>
          );
        },
        'now',
      ),
    ];
  }
}
