import { joinClassNames } from '../utils/classNames';
import styles from './CompareToggle.module.css';

interface CompareToggleProps {
  siteName: string;
  picked: boolean;
  /** No room left (the compare set is full) and this site is not in it. */
  full: boolean;
  onToggle: () => void;
  /** "icon": a square beside a site card. "text": a labelled button (Site details). */
  variant?: 'icon' | 'text';
  className?: string;
}

/** Adds a site to the compare set or takes it out. Picked shows a tick, never colour alone. */
export function CompareToggle({
  siteName,
  picked,
  full,
  onToggle,
  variant = 'icon',
  className,
}: CompareToggleProps) {
  const blocked = full && !picked;
  const hint = picked
    ? `Remove ${siteName} from compare`
    : blocked
      ? 'Compare holds up to 4 sites'
      : `Add ${siteName} to compare`;
  return (
    <button
      type="button"
      className={joinClassNames(styles.toggle, styles[variant], picked && styles.picked, className)}
      aria-pressed={picked}
      aria-disabled={blocked || undefined}
      // The hover title is not read by every screen reader: a full set says so in the name.
      aria-label={
        variant === 'icon'
          ? `Compare ${siteName}${blocked ? ' (compare holds up to 4 sites)' : ''}`
          : undefined
      }
      title={hint}
      onClick={() => {
        if (!blocked) onToggle();
      }}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        {picked ? (
          <path
            d="M3.5 8.5 6.5 11.5 12.5 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          // Two columns side by side: compare.
          <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
            <rect x="2.5" y="3" width="4.5" height="10" rx="1" />
            <rect x="9" y="3" width="4.5" height="10" rx="1" />
          </g>
        )}
      </svg>
      {variant === 'text' ? (picked ? 'In compare' : 'Compare') : null}
      {variant === 'text' && blocked ? (
        <span className="visually-hidden"> (compare holds up to 4 sites)</span>
      ) : null}
    </button>
  );
}
