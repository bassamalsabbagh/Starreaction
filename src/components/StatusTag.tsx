import { joinClassNames } from '../utils/classNames';
import styles from './StatusTag.module.css';

/**
 * A value's data-status or source tag as a small pill ("Calculated", "Unavailable", "S", "A"),
 * always in words, never colour alone.
 */
export function StatusTag({ children, quiet = false }: { children: string; quiet?: boolean }) {
  return <span className={joinClassNames(styles.tag, quiet && styles.quiet)}>{children}</span>;
}
