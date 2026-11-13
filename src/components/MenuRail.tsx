import type { ReactNode } from 'react';
import { joinClassNames } from '../utils/classNames';
import styles from './MenuRail.module.css';

export type RailItem = 'sites' | 'mission' | 'compare' | 'lessons' | 'demo' | 'about';

interface MenuRailProps {
  /** The item whose view the left panel shows, or null when it is closed. */
  active: RailItem | null;
  onSelect: (item: RailItem, opener: HTMLElement) => void;
  /** The left panel's id: the view items control it. */
  panelId: string;
  /** How many sites are picked for comparing, shown on Compare. */
  compareCount: number;
}

const ICON = {
  viewBox: '0 0 20 20',
  width: 20,
  height: 20,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

const ITEMS: readonly { id: RailItem; label: string; icon: ReactNode; view: boolean }[] = [
  {
    id: 'mission',
    label: 'Mission',
    view: true,
    icon: (
      <svg {...ICON}>
        <path d="M6.5 9.5h7l-1.4-4h-4.2zM7.5 9.5l-3 6M12.5 9.5l3 6M10 9.5v4M3 15.5h3.5M13.5 15.5H17" />
      </svg>
    ),
  },
  {
    id: 'sites',
    label: 'Sites',
    view: true,
    icon: (
      <svg {...ICON}>
        <path d="M7.5 5.5h9M7.5 10h9M7.5 14.5h9" />
        <circle cx="4" cy="5.5" r="0.9" fill="currentColor" />
        <circle cx="4" cy="10" r="0.9" fill="currentColor" />
        <circle cx="4" cy="14.5" r="0.9" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'compare',
    label: 'Compare',
    view: true,
    icon: (
      <svg {...ICON}>
        <rect x="3" y="4" width="5.5" height="12" rx="1" />
        <rect x="11.5" y="4" width="5.5" height="12" rx="1" />
      </svg>
    ),
  },
  {
    id: 'lessons',
    label: 'Lessons',
    view: true,
    icon: (
      <svg {...ICON}>
        <path d="M10 5.5c-1.6-1.2-3.8-1.6-6-1.2v10.5c2.2-.4 4.4 0 6 1.2 1.6-1.2 3.8-1.6 6-1.2V4.3c-2.2-.4-4.4 0-6 1.2zM10 5.5v10.5" />
      </svg>
    ),
  },
  {
    id: 'demo',
    label: 'Demo',
    view: false,
    icon: (
      <svg {...ICON}>
        <circle cx="10" cy="10" r="6.5" />
        <path d="M8.5 7.2v5.6l4.4-2.8z" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: 'about',
    label: 'About',
    view: false,
    icon: (
      <svg {...ICON}>
        <circle cx="10" cy="10" r="6.5" />
        <path d="M10 9v4.5" />
        <circle cx="10" cy="6.6" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
];

/** Demo and About are actions, not views: they sit apart, at the foot of the rail. */
const FIRST_ACTION = ITEMS.findIndex((item) => !item.view);

/**
 * The menu rail on the far left: one icon with a short label per view. A view item opens its view
 * in the left panel, and closes the panel when it is already showing; the active one carries an
 * orange marker. Demo starts the guided demo; About opens the About window.
 */
export function MenuRail({ active, onSelect, panelId, compareCount }: MenuRailProps) {
  return (
    <nav className={styles.rail} aria-label="Menu" data-tour="rail">
      <ul className={styles.list}>
        {ITEMS.map((item, index) => {
          const on = item.view && active === item.id;
          return (
            <li key={item.id} className={index === FIRST_ACTION ? styles.actions : undefined}>
              <button
                type="button"
                className={joinClassNames(styles.item, on && styles.active)}
                aria-expanded={item.view ? on : undefined}
                aria-controls={item.view ? panelId : undefined}
                aria-haspopup={item.id === 'about' ? 'dialog' : undefined}
                data-demo-start={item.id === 'demo' ? '' : undefined}
                onClick={(event) => onSelect(item.id, event.currentTarget)}
              >
                {item.icon}
                <span className={styles.label}>{item.label}</span>
                {item.id === 'compare' && compareCount > 0 ? (
                  <>
                    <span className={styles.count} aria-hidden="true">
                      {compareCount}
                    </span>
                    <span className="visually-hidden">, {compareCount} picked</span>
                  </>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
