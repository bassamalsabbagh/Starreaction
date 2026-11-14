import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { StatusTag } from '../../components/StatusTag';
import { formatDays, type CompareEntry, type DemoMission } from '../../data/demoData';
import { joinClassNames } from '../../utils/classNames';
import { SOUTH_POLE, formatKm, haversineKm } from '../../utils/distance';
import { formatWindowRange, rangeWords, type TimeRange } from '../../utils/time';
import { daysFromHours, tileHours, type TileKey } from '../lunar-map/checkTileValues';
import { bestTiles } from './bestTiles';
import styles from './ComparePanel.module.css';

interface CompareFullProps {
  id: string;
  entries: readonly CompareEntry[];
  mission: DemoMission;
  /** The step 3 dates. */
  range: TimeRange;
  onClose: () => void;
  onSelectSite: (siteId: string) => void;
}

/** "Best" as a word on the cell, so the highlight never rests on colour alone. */
function BestMark() {
  return <span className={styles.bestMark}>Best</span>;
}

/** Pass or Fail, as a word with a mark. */
function gate(passes: boolean, label: string) {
  return (
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
      {label}
    </span>
  );
}

/**
 * "Full comparison": the whole table in a panel to the right of the main panel, sized to need no
 * scrolling: one column per place, one row per question, one line per cell.
 */
export function CompareFull({
  id,
  entries,
  mission,
  range,
  onClose,
  onSelectSite,
}: CompareFullProps) {
  const words = rangeWords(range);
  const best = useMemo(() => bestTiles(entries), [entries]);
  const row = (label: ReactNode, cell: (entry: CompareEntry) => ReactNode, key: string) => (
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

  const tileRow = (key: TileKey, label: string) =>
    row(
      label,
      (entry) => {
        const sky = entry.assessment.sky;
        const check = entry.assessment.checks.find(
          (item) => item.id === (key === 'sun' ? 'sunlight' : key === 'earth' ? 'earth' : 'window'),
        );
        const relay = mission.hasRelay && key !== 'sun';
        const passes = relay || (check?.passes ?? false);
        const total = daysFromHours(tileHours(entry.assessment)[key]);
        // The longest stretch is a second line only when it differs from the total.
        const stretchDays = key === 'sun' ? sky.longestSunlitDays : sky.longestWindowDays;
        const stretch = key === 'earth' ? null : formatDays(stretchDays);
        const isBest = best.get(key)?.has(entry.site.id) ?? false;
        return (
          <div className={joinClassNames(styles.value, isBest && styles.best)}>
            <span className={styles.line}>
              <span>{total}</span>
              {gate(passes, relay ? 'Relay' : passes ? 'Pass' : 'Fail')}
              {isBest ? <BestMark /> : null}
            </span>
            {stretch && stretch !== total ? (
              <span className={styles.sub}>longest {stretch}</span>
            ) : null}
          </div>
        );
      },
      `tile-${key}`,
    );

  return (
    <aside id={id} className={styles.full} aria-labelledby={`${id}-title`}>
      <header className={styles.fullHead}>
        <h2 id={`${id}-title`} className={styles.title}>
          Full comparison
        </h2>
        <button
          type="button"
          className={styles.fullClose}
          aria-label="Close full comparison"
          onClick={onClose}
        >
          ✕
        </button>
      </header>
      <div className={styles.scroll}>
        <table
          className={styles.table}
          // Each site column keeps its minimum width; more sites scroll sideways.
          style={{ '--columns': entries.length } as CSSProperties}
        >
          <caption className="visually-hidden">
            {entries.length} locations compared for {mission.name}
          </caption>
          <thead>
            <tr>
              <td className={styles.corner} />
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
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tileRow('sun', 'Sun up')}
            {tileRow('earth', 'Earth in view')}
            {tileRow('both', 'Sun + Earth together')}
            {row(
              'Best window',
              (entry) => {
                const window = entry.assessment.bestWindow;
                return window ? (
                  <div className={styles.value}>
                    <span>{formatWindowRange(window)}</span>
                  </div>
                ) : (
                  <div className={styles.excluded}>None {words.within}</div>
                );
              },
              'window',
            )}
            {row(
              'From the south pole',
              (entry) => (
                <div className={styles.value}>
                  <span>
                    {formatKm(haversineKm(entry.site, SOUTH_POLE))}
                    <StatusTag>Calculated</StatusTag>
                  </span>
                </div>
              ),
              'pole',
            )}
          </tbody>
        </table>
      </div>
    </aside>
  );
}
