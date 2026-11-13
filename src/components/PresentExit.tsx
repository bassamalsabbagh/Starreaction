import { useEffect, useState } from 'react';
import { joinClassNames } from '../utils/classNames';
import styles from './PresentExit.module.css';

/** Presentation mode's exit fades out after this long without the mouse moving. */
const IDLE_MS = 2_000;

/**
 * "Exit presentation", top right, only in presentation mode. It shows when the mouse moves and
 * fades after 2 s of stillness, so the Moon stays clean on a projector; keyboard focus shows it
 * too. H and Escape also leave (App).
 */
export function PresentExit({ onExit }: { onExit: () => void }) {
  const [awake, setAwake] = useState(true);
  useEffect(() => {
    let timer = window.setTimeout(() => setAwake(false), IDLE_MS);
    const wake = () => {
      setAwake(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setAwake(false), IDLE_MS);
    };
    window.addEventListener('pointermove', wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', wake);
    };
  }, []);
  return (
    <button
      type="button"
      className={joinClassNames(styles.exit, awake && styles.awake)}
      onClick={onExit}
      title="Exit presentation (H or Esc)"
    >
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
        <path
          d="M7.5 3.5v4h-4M12.5 3.5v4h4M7.5 16.5v-4h-4M12.5 16.5v-4h4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Exit presentation
    </button>
  );
}
