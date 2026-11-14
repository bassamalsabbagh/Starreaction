import { useEffect, useRef } from 'react';
import styles from './PowerLabPanel.module.css';

/** The calculator's page, in a new tab (public/power-lab.html, served as it was supplied). */
const POWER_LAB_URL = `${import.meta.env.BASE_URL}power-lab.html`;

/** The title, the one-sentence description and the link: the same in the panel and the pop-up. */
function PowerLabContent({ headingId }: { headingId: string }) {
  return (
    <>
      <h2 id={headingId} className={styles.title}>
        Moon Power Lab
      </h2>
      <p className={styles.text}>
        How big a battery does a lander need to survive the Moon night? Try panel size, Sun height
        and night length, using published lander numbers.
      </p>
      <a className={styles.link} href={POWER_LAB_URL} target="_blank" rel="noopener noreferrer">
        Open the Moon Power Lab →
      </a>
    </>
  );
}

/** The Power Lab in the left panel (the rail's "Power Lab"). */
export function PowerLabPanel() {
  return (
    <section className={styles.panel} aria-labelledby="power-lab-title">
      <PowerLabContent headingId="power-lab-title" />
    </section>
  );
}

/**
 * The same content as a small pop-up over the page ("Design your own battery →"). Its X, a click
 * outside it and Escape close it; nothing underneath changes.
 */
export function PowerLabDialog({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={styles.backdrop} onClick={onClose} data-testid="power-lab-backdrop">
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="power-lab-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          ref={closeRef}
          type="button"
          className={styles.close}
          aria-label="Close the Moon Power Lab"
          onClick={onClose}
        >
          ✕
        </button>
        <PowerLabContent headingId="power-lab-dialog-title" />
      </div>
    </div>
  );
}
