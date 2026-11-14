import { useMemo } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { compareLine } from '../../data/compareVerdict';
import type { CompareEntry, DemoMission } from '../../data/demoData';
import { joinClassNames } from '../../utils/classNames';
import { CheckTiles } from '../lunar-map/CheckTiles';
import type { TileKey } from '../lunar-map/checkTileValues';
import { bestTiles } from './bestTiles';
import styles from './ComparePanel.module.css';

interface ComparePanelProps {
  id: string;
  /** The picked places, in the order shown, from the same checks as Results. */
  entries: readonly CompareEntry[];
  mission: DemoMission;
  compareMax: number;
  onRemove: (siteId: string) => void;
  onClear: () => void;
  onClose: () => void;
  onSelectSite: (siteId: string) => void;
  /** "Full comparison ›": the whole table, beside this panel. */
  onFull: () => void;
  fullOpen: boolean;
  className?: string;
}

/**
 * Compare, compact enough to need no scrolling: one short line saying which is best, one card per
 * place with the three Results tiles (the winner of each row marked "Best"), and a button for the
 * full table. It reads only what the checks already worked out.
 */
export function ComparePanel({
  id,
  entries,
  mission,
  compareMax,
  onRemove,
  onClear,
  onClose,
  onSelectSite,
  onFull,
  fullOpen,
  className,
}: ComparePanelProps) {
  const line = compareLine(entries, mission.hasRelay);
  const best = useMemo(() => bestTiles(entries), [entries]);
  return (
    <section
      id={id}
      className={joinClassNames(styles.panel, className)}
      aria-labelledby={`${id}-title`}
    >
      <header className={styles.head}>
        <h2 id={`${id}-title`} className={styles.title}>
          Pick 2 to {compareMax} places to compare
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

      <p className={styles.subtitle}>Click a past landing, click the Moon, or type coordinates.</p>

      {entries.length < 2 ? (
        <div className={styles.empty}>
          <EmptyState title="Nothing to compare yet">
            Add two or more locations above to compare them.
          </EmptyState>
        </div>
      ) : (
        <div className={styles.cards}>
          {line ? (
            <p className={styles.verdict} data-testid="compare-verdict">
              {line.parts.map((part, index) =>
                part.bold ? <strong key={index}>{part.text}</strong> : part.text,
              )}
            </p>
          ) : null}
          <ul className={styles.cardList} aria-label="Compared locations">
            {entries.map((entry) => (
              <li key={entry.site.id} className={styles.card}>
                <div className={styles.cardHead}>
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
                </div>
                <CheckTiles
                  assessment={entry.assessment}
                  mission={mission}
                  compact
                  best={
                    new Set(
                      (['sun', 'earth', 'both'] as TileKey[]).filter((key) =>
                        best.get(key)?.has(entry.site.id),
                      ),
                    )
                  }
                />
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={styles.full_button}
            aria-expanded={fullOpen}
            onClick={onFull}
          >
            Full comparison ›
          </button>
        </div>
      )}
    </section>
  );
}
