import { useId, type ReactNode } from 'react';
import { joinClassNames } from '../utils/classNames';
import styles from './Collapsible.module.css';

interface CollapsibleProps {
  /** The section's name; it is the toggle button's text. */
  title: ReactNode;
  /** Quiet text on the right of the header, e.g. "3 suitable". */
  meta?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
  /** Header text style: a small uppercase label, or sentence-case body text. */
  variant?: 'label' | 'body';
}

/**
 * A section that opens and closes under a caret header. The height animates with grid rows (no
 * measuring); the closed body is inert, so nothing inside can be focused or read.
 */
export function Collapsible({
  title,
  meta,
  open,
  onToggle,
  children,
  className,
  variant = 'label',
}: CollapsibleProps) {
  const bodyId = useId();
  return (
    <section className={joinClassNames(styles.section, className)}>
      <h3 className={styles.heading}>
        <button
          type="button"
          className={joinClassNames(
            styles.toggle,
            variant === 'label' ? styles.variantLabel : styles.variantBody,
          )}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          <svg
            className={joinClassNames(styles.caret, open && styles.caretOpen)}
            viewBox="0 0 16 16"
            width="14"
            height="14"
            aria-hidden="true"
          >
            <path
              d="M6 3.5l4.5 4.5L6 12.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className={styles.title}>{title}</span>
        </button>
        {meta ? <span className={styles.meta}>{meta}</span> : null}
      </h3>
      <div
        id={bodyId}
        className={joinClassNames(styles.collapse, open && styles.collapseOpen)}
        inert={!open}
      >
        <div className={styles.inner}>
          <div className={styles.body}>{children}</div>
        </div>
      </div>
    </section>
  );
}
