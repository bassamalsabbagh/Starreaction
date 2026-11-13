import { useLayoutEffect, useRef, type ReactNode, type Ref } from 'react';
import { joinClassNames } from '../utils/classNames';
import styles from './FloatingPanel.module.css';

interface FloatingPanelProps {
  id?: string;
  /** Showing its view; closed, it slides away behind the rail and leaves its handle. */
  open: boolean;
  /** The handle on its right edge: ‹ slides it away, › brings it back. */
  onToggle: () => void;
  /** Compare: wider than the others. */
  wide?: boolean;
  /** Presentation mode: gone, handle included. */
  hidden?: boolean;
  panelRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}

/**
 * The one floating panel on the left, beside the menu rail, over the Moon (it never moves or
 * resizes the map). It holds one view at a time. Closed, its content is inert and off screen, and
 * only the handle stays, so the panel can come back from where it went.
 */
export function FloatingPanel({
  id,
  open,
  onToggle,
  wide = false,
  hidden = false,
  panelRef,
  children,
}: FloatingPanelProps) {
  const shown = open && !hidden;
  const contentRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  // Closed with focus inside (Escape): the content turns inert, so focus moves to the handle, the
  // way back, instead of falling to the page.
  useLayoutEffect(() => {
    if (shown || hidden) return;
    if (contentRef.current?.contains(document.activeElement)) handleRef.current?.focus();
  }, [shown, hidden]);
  return (
    <div
      ref={panelRef}
      className={joinClassNames(
        styles.dock,
        shown && styles.open,
        wide && styles.wide,
        hidden && styles.gone,
      )}
      data-open={shown}
      inert={hidden}
      aria-hidden={hidden || undefined}
    >
      <div
        ref={contentRef}
        id={id}
        className={styles.panel}
        inert={!shown}
        aria-hidden={!shown || undefined}
      >
        {children}
      </div>
      <button
        ref={handleRef}
        type="button"
        className={styles.handle}
        aria-label={open ? 'Hide the panel' : 'Show the panel'}
        aria-expanded={open}
        aria-controls={id}
        title={open ? 'Hide the panel' : 'Show the panel'}
        onClick={onToggle}
      >
        {/* One ‹, turned to › as the panel goes, so the arrow rotates with the slide. */}
        <svg className={styles.arrow} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path
            d="M10 3.5 5.5 8l4.5 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
