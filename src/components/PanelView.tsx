import { useId, type ReactNode } from 'react';
import styles from './PanelView.module.css';

interface PanelViewProps {
  title: string;
  /** A quiet line beside the title (the lander's name). */
  meta?: ReactNode;
  children: ReactNode;
}

/** A simple left-panel view: its title, then its content (the Lander and Replay views). */
export function PanelView({ title, meta, children }: PanelViewProps) {
  const titleId = useId();
  return (
    <section className={styles.view} aria-labelledby={titleId}>
      <div className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {meta ? <span className={styles.meta}>{meta}</span> : null}
      </div>
      {children}
    </section>
  );
}
