import { useState } from 'react';
import { Collapsible } from '../../components/Collapsible';
import { StatusTag } from '../../components/StatusTag';
import { nightSurvival, type Lander } from '../../services/landers';
import { joinClassNames } from '../../utils/classNames';
import { batteryLastsText, landerValueText, tagSource, verdictLine } from './nightSurvivalText';
import styles from './NightSurvival.module.css';

interface NightSurvivalProps {
  /** The site's lander (data/landers.json), or undefined when none is loaded. */
  lander: Lander | undefined;
  /** The longest darkness in the checked range at this site (the Power check's night). */
  dark: { hours: number; atLeast: boolean };
}

/** The values shown, in order: label, field. Source notes and conflicts live on the About page. */
const ROWS = [
  ['Solar power', 'solarPowerW'],
  ['Battery', 'batteryWh'],
  ['Night load', 'heaterW'],
] as const;

/**
 * Next to the Power check in Site details (docs/LANDER_RULES.md, "Lander night survival"): five
 * short rows (lander, solar power, battery, night load, how long the battery lasts) and one verdict
 * line. Hovering a tag gives its one-line source; the long notes are on the About page.
 */
export function NightSurvival({ lander, dark }: NightSurvivalProps) {
  const [open, setOpen] = useState(false);
  const result = nightSurvival(lander, dark);
  const verdict = verdictLine(result, dark);
  return (
    <Collapsible
      title="Night survival"
      meta={verdict.short}
      variant="body"
      open={open}
      onToggle={() => setOpen(!open)}
    >
      <div className={styles.body} data-testid="night-survival">
        {lander ? (
          <dl className={styles.values}>
            <div className={styles.row}>
              <dt>Lander</dt>
              <dd>
                <span className={styles.value}>{lander.name}</span>
              </dd>
            </div>
            {ROWS.map(([label, field]) => {
              const value = lander.fields[field];
              return (
                <div key={field} className={styles.row}>
                  <dt>{label}</dt>
                  <dd>
                    <span className={styles.value}>{landerValueText(field, value)}</span>
                    <span title={tagSource(value)}>
                      <StatusTag quiet={value.value === null}>{value.tag}</StatusTag>
                    </span>
                  </dd>
                </div>
              );
            })}
            <div className={styles.row}>
              <dt>Battery lasts</dt>
              <dd>
                <span className={styles.value}>{batteryLastsText(result)}</span>
              </dd>
            </div>
          </dl>
        ) : null}
        <p
          className={joinClassNames(
            styles.verdict,
            verdict.kind === 'survives' && styles.ok,
            verdict.kind === 'doesnt' && styles.fail,
          )}
          data-testid="night-verdict"
        >
          <strong>{verdict.text}</strong>
        </p>
      </div>
    </Collapsible>
  );
}
