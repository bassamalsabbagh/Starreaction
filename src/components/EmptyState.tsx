import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  title: string;
  children: ReactNode;
}

/** Dashed recessed well for "nothing here yet" (DESIGN.md: The Dashed-Means-Absent Rule). */
export function EmptyState({ title, children }: EmptyStateProps) {
  return (
    <div className={styles.emptyState}>
      <p className={styles.title}>{title}</p>
      <p className={styles.note}>{children}</p>
    </div>
  );
}
