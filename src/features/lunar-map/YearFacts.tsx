import { StatusTag } from '../../components/StatusTag';
import type { YearFact } from '../../types/yearFact';
import styles from './YearFacts.module.css';

/**
 * Light, water and Earth over the year, each with its data-status tag (its source is on the About
 * page; docs/LANDER_RULES.md, "Light, water and Earth over the year").
 */
export function YearFacts({ facts }: { facts: readonly YearFact[] }) {
  return (
    <div className={styles.block} role="group" aria-label="Over the year">
      <dl className={styles.list}>
        {facts.map((fact) => (
          <div key={fact.id} className={styles.row}>
            <dt>{fact.label}</dt>
            <dd>
              <span className={styles.value}>{fact.value}</span>
              <StatusTag quiet={fact.status === 'Unavailable'}>{fact.status}</StatusTag>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
