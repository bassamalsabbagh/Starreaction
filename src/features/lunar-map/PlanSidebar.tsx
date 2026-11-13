import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Collapsible } from '../../components/Collapsible';
import { CompareToggle } from '../../components/CompareToggle';
import {
  SITE_ORDER_LABEL,
  bestDemoSite,
  formatDays,
  formatShare,
  type DemoMission,
  type RankedDemoSite,
  type SiteOrder,
} from '../../data/demoData';
import { formatNeedsMet, formatNeedsMetShort, needsMet } from '../../data/needsMet';
import { joinClassNames } from '../../utils/classNames';
import type { LatLon } from '../../utils/lunarSky';
import {
  DAY_MS,
  RANGE_MS,
  formatWindowLength,
  formatWindowRange,
  type TimeRange,
} from '../../utils/time';
import { CoordinateSearch } from './CoordinateSearch';
import { prefersReducedMotion } from './moonScene';
import styles from './PlanSidebar.module.css';

interface PlanSidebarProps {
  mission: DemoMission;
  rankedSites: readonly RankedDemoSite[];
  /** The checked month: a best window that runs past it also says how much is inside. */
  range: TimeRange;
  selectedSiteId: string | null;
  onSelectSite: (siteId: string) => void;
  /** The site highlighted on the map or in this list; its row lights up. */
  hoveredSiteId: string | null;
  onHoverSite: (siteId: string | null) => void;
  order: SiteOrder;
  onOrderChange: (order: SiteOrder) => void;
  /** A typed coordinate: check that point, as if it were clicked on the Moon. */
  onGoToPoint: (point: LatLon) => void;
  /** Sites picked for comparing, in the order they were picked. */
  comparedIds: readonly string[];
  /** The most sites the compare set holds. */
  compareMax: number;
  onToggleCompare: (siteId: string) => void;
  compareOpen: boolean;
  onToggleComparePanel: () => void;
  /** The compare panel's id, for the Compare button's aria-controls. */
  comparePanelId: string;
  /** Opens a section for the guided demo (a new seq each time); not saved as a preference. */
  reveal?: { section: SectionId; seq: number } | null;
}

export type SectionId = 'notSuitable';

const ORDERS: readonly SiteOrder[] = ['window', 'sunlight', 'earth', 'name'];

/** The number a row shows for the chosen order, and the word under it. */
function rowValue(entry: RankedDemoSite, order: SiteOrder): { value: string; word: string } {
  const { assessment } = entry;
  switch (order) {
    case 'sunlight':
      return { value: formatShare(assessment.sky.sunPct), word: 'Sun up' };
    case 'earth':
      return { value: formatShare(assessment.sky.earthPct), word: 'Earth up' };
    default:
      // The part of the usable window inside this month: what the checks use (not its whole length).
      return {
        value: formatDays(assessment.usableDays).replace(' days', ' d'),
        word: 'usable this month',
      };
  }
}

/**
 * "Sites", the default view: a coordinate box, the order switch, then every site that suits the
 * mission, best first. #1 carries the orange best-match marker and its best window; the rest
 * follow as cards; then the sites that do not suit it, folded, each with its reasons on one line.
 */
export function PlanSidebar({
  mission,
  rankedSites,
  range,
  selectedSiteId,
  onSelectSite,
  hoveredSiteId,
  onHoverSite,
  order,
  onOrderChange,
  onGoToPoint,
  comparedIds,
  compareMax,
  onToggleCompare,
  compareOpen,
  onToggleComparePanel,
  comparePanelId,
  reveal = null,
}: PlanSidebarProps) {
  const selectedRowRef = useRef<HTMLButtonElement>(null);
  const hoveredRowRef = useRef<HTMLButtonElement>(null);
  const [notSuitableOpen, setNotSuitableOpen] = useState(false);
  const [revealSeen, setRevealSeen] = useState(reveal?.seq ?? 0);
  if (reveal && reveal.seq !== revealSeen) {
    setRevealSeen(reveal.seq);
    if (!notSuitableOpen) setNotSuitableOpen(true);
  }

  const suitable = rankedSites.filter((entry) => entry.rank !== null);
  const notSuitable = rankedSites.filter((entry) => entry.rank === null);
  const bestId = bestDemoSite(rankedSites)?.site.id ?? null;
  const selectedIsUnsuitable = notSuitable.some((entry) => entry.site.id === selectedSiteId);

  // If the selection is (or becomes, after a mission change) unsuitable, open its group so the
  // selected row is never hidden.
  const selectionKey = `${selectedSiteId ?? ''}|${mission.id}`;
  const [openedFor, setOpenedFor] = useState(selectionKey);
  if (openedFor !== selectionKey) {
    setOpenedFor(selectionKey);
    if (selectedIsUnsuitable && !notSuitableOpen) setNotSuitableOpen(true);
  }

  // Bring a new selection into view (smoothly, or instantly under reduced motion), once its
  // group has finished opening.
  useEffect(() => {
    if (!selectedSiteId) return undefined;
    const reduced = prefersReducedMotion();
    const timer = window.setTimeout(
      () =>
        selectedRowRef.current?.scrollIntoView?.({
          block: 'nearest',
          behavior: reduced ? 'auto' : 'smooth',
        }),
      reduced ? 0 : 220,
    );
    return () => window.clearTimeout(timer);
  }, [selectedSiteId, selectedIsUnsuitable]);

  // A beacon hovered on the map scrolls its row into view (only if it is out of view).
  useEffect(() => {
    if (!hoveredSiteId) return;
    hoveredRowRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [hoveredSiteId]);

  // When the order changes (the date moved, the mission, or the order switch), rows glide from their old places
  // to their new ones over 200ms (FLIP). Decorative: none under reduced motion.
  const listRef = useRef<HTMLOListElement>(null);
  const rowTops = useRef(new Map<string, number>());
  const rowOrder = suitable.map((entry) => entry.site.id).join('|');
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const rows = list.querySelectorAll<HTMLElement>('[data-site-id]');
    // A re-rank can land mid-glide: stop the old glides first, so rows are measured where they
    // really are and the new glide starts from the row's current place (interruptible).
    rows.forEach((row) => {
      if (typeof row.getAnimations === 'function') {
        for (const animation of row.getAnimations()) animation.cancel();
      }
    });
    const listTop = list.getBoundingClientRect().top;
    const next = new Map<string, number>();
    rows.forEach((row) => {
      next.set(row.dataset.siteId ?? '', row.getBoundingClientRect().top - listTop);
    });
    if (!prefersReducedMotion()) {
      rows.forEach((row) => {
        const before = rowTops.current.get(row.dataset.siteId ?? '');
        const after = next.get(row.dataset.siteId ?? '');
        if (before === undefined || after === undefined || before === after) return;
        if (typeof row.animate !== 'function') return;
        row.animate([{ transform: `translateY(${before - after}px)` }, { transform: 'none' }], {
          duration: 200,
          easing: 'cubic-bezier(0.2, 0, 0, 1)',
        });
      });
    }
    rowTops.current = next;
  }, [rowOrder]);

  const rowRef = (siteId: string) =>
    siteId === selectedSiteId
      ? selectedRowRef
      : siteId === hoveredSiteId
        ? hoveredRowRef
        : undefined;

  const compareFull = comparedIds.length >= compareMax;
  const compareToggle = (siteId: string, siteName: string) => (
    <CompareToggle
      siteName={siteName}
      picked={comparedIds.includes(siteId)}
      full={compareFull}
      onToggle={() => onToggleCompare(siteId)}
    />
  );

  const hoverProps = (siteId: string) => ({
    onMouseEnter: () => onHoverSite(siteId),
    onMouseLeave: () => onHoverSite(null),
    onFocus: () => onHoverSite(siteId),
    onBlur: () => onHoverSite(null),
  });

  return (
    <aside className={styles.sidebar} aria-label="Sites">
      <div className={styles.viewHeader}>
        <h2 className={styles.viewTitle}>Sites</h2>
        <span className={styles.viewMeta}>
          {mission.name} · {suitable.length} suitable · DEMO sites
        </span>
      </div>

      <CoordinateSearch onGo={onGoToPoint} />

      <div className={styles.order} role="group" aria-label="Order sites by">
        {ORDERS.map((option) => (
          <button
            key={option}
            type="button"
            className={styles.orderButton}
            aria-pressed={order === option}
            onClick={() => onOrderChange(option)}
          >
            {SITE_ORDER_LABEL[option]}
          </button>
        ))}
      </div>

      {suitable.length === 0 ? (
        <p className={styles.none}>
          No site suits {mission.name} in this month. Try another mission or move the time.
        </p>
      ) : null}

      <ol ref={listRef} className={styles.list} aria-label="Ranked sites" data-tour="sites">
        {suitable.map((entry) => {
          const { site, assessment, rank } = entry;
          const selected = site.id === selectedSiteId;
          // The best match is the longest usable window, wherever the chosen order puts it.
          const best = site.id === bestId;
          const shown = rowValue(entry, order);
          const needs = formatNeedsMetShort(needsMet(assessment, mission));
          const window = assessment.bestWindow;
          return (
            <li
              key={site.id}
              data-site-id={site.id}
              className={joinClassNames(styles.item, best && styles.bestItem)}
              data-tour={best ? 'best' : undefined}
            >
              <button
                ref={rowRef(site.id)}
                type="button"
                className={joinClassNames(
                  styles.row,
                  best && styles.bestRow,
                  site.id === hoveredSiteId && styles.rowHovered,
                  selected && styles.rowSelected,
                )}
                aria-pressed={selected}
                aria-label={`Rank ${rank}: ${site.name}, ${shown.word} ${shown.value}, ${needs}`}
                onClick={() => onSelectSite(site.id)}
                {...hoverProps(site.id)}
              >
                <span className={styles.rank}>
                  {best ? <span className={styles.bestMark} aria-hidden="true" /> : rank}
                </span>
                <span className={styles.rowMain}>
                  <span className={styles.name}>{site.name}</span>
                  <span className={styles.needs}>{needs}</span>
                  <span className={styles.bar} aria-hidden="true">
                    <span
                      className={styles.barFill}
                      style={{
                        transform: `scaleX(${Math.min(1, (assessment.usableDays * DAY_MS) / RANGE_MS)})`,
                      }}
                    />
                  </span>
                </span>
                <span className={styles.score}>
                  <span className={styles.scoreValue}>{shown.value}</span>
                  <span className={styles.word}>{shown.word}</span>
                </span>
                {best ? (
                  // The best match: when to land, and how much of the month each body is up.
                  <span className={styles.bestFacts}>
                    <span className={styles.bestFact}>
                      <span className={styles.bestLabel}>Best window</span>{' '}
                      {window
                        ? `${formatWindowRange(window)} · ${formatWindowLength(window, range)}`
                        : 'None in this month'}
                    </span>
                    <span className={styles.bestFact}>
                      <span className={styles.bestLabel}>This month</span> Sun up{' '}
                      {formatShare(assessment.sky.sunPct)} · Earth up{' '}
                      {formatShare(assessment.sky.earthPct)}
                    </span>
                  </span>
                ) : null}
              </button>
              {compareToggle(site.id, site.name)}
            </li>
          );
        })}
      </ol>

      {notSuitable.length > 0 ? (
        <Collapsible
          title={`Not suitable (${notSuitable.length})`}
          variant="body"
          open={notSuitableOpen}
          onToggle={() => setNotSuitableOpen(!notSuitableOpen)}
        >
          <ul className={styles.list} data-tour="excluded">
            {notSuitable.map(({ site, assessment }) => {
              const selected = site.id === selectedSiteId;
              return (
                <li key={site.id} className={styles.item}>
                  <button
                    ref={rowRef(site.id)}
                    type="button"
                    className={joinClassNames(
                      styles.unsuitableRow,
                      site.id === hoveredSiteId && styles.rowHovered,
                      selected && styles.rowSelected,
                    )}
                    aria-pressed={selected}
                    onClick={() => onSelectSite(site.id)}
                    {...hoverProps(site.id)}
                  >
                    <span className={styles.unsuitableHead}>
                      <span className={styles.name}>{site.name}</span>
                      <span className={styles.excluded}>Not suitable for this mission</span>
                    </span>
                    <span className={styles.reason}>{assessment.failTitles.join(' · ')}</span>
                    <span className={styles.needs}>
                      {formatNeedsMet(needsMet(assessment, mission), mission)}
                    </span>
                  </button>
                  {compareToggle(site.id, site.name)}
                </li>
              );
            })}
          </ul>
        </Collapsible>
      ) : null}

      {comparedIds.length > 0 ? (
        <div className={styles.compareBar}>
          {comparedIds.length >= 2 ? (
            <button
              type="button"
              className={styles.compareButton}
              aria-expanded={compareOpen}
              aria-controls={comparePanelId}
              onClick={onToggleComparePanel}
            >
              Compare ({comparedIds.length})
            </button>
          ) : (
            <p className={styles.compareHint}>1 site picked. Pick one more to compare.</p>
          )}
        </div>
      ) : null}
    </aside>
  );
}
