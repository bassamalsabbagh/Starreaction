import { useState } from 'react';
import { Collapsible } from '../../components/Collapsible';
import { StatusTag } from '../../components/StatusTag';
import {
  LANDER_FIELD_LABEL,
  LANDER_FIELDS,
  mentionsConflict,
  nightSurvival,
  type Lander,
} from '../../services/landers';
import { joinClassNames } from '../../utils/classNames';
import {
  batteryNeededText,
  landerValueText,
  verdictDetail,
  verdictTitle,
} from './nightSurvivalText';
import styles from './NightSurvival.module.css';

interface NightSurvivalProps {
  /** The site's lander (data/landers.json), or undefined when none is loaded. */
  lander: Lander | undefined;
  /** The longest darkness in the checked range at this site (the Power check's night). */
  dark: { hours: number; atLeast: boolean };
  /** The user's night-load slider in Power details, W: for "Battery needed here". */
  loadW: number;
  /** "in this month" or "in these dates", for the wording. */
  within: string;
}

/**
 * Next to the Power check in Site details (docs/LANDER_RULES.md, "Lander night survival"): the
 * lander's five values, each with its tag (S, S*, D, A, not published), source and any conflict
 * note; whether its battery outlasts the longest darkness here; and the battery needed here. The
 * touchdown slope is information only, never a check.
 */
export function NightSurvival({ lander, dark, loadW, within }: NightSurvivalProps) {
  const [open, setOpen] = useState(false);
  const result = nightSurvival(lander, dark);
  const title = verdictTitle(result);
  const slope = lander?.fields.touchdownSlopeDeg;
  return (
    <Collapsible
      title="Night survival"
      meta={result.kind === 'cant-judge' ? "Can't judge" : title}
      variant="body"
      open={open}
      onToggle={() => setOpen(!open)}
    >
      <div className={styles.body} data-testid="night-survival">
        {lander ? (
          <>
            <p className={styles.lander}>
              <span className={styles.label}>Lander</span> {lander.name}
            </p>
            <dl className={styles.values}>
              {LANDER_FIELDS.map((field) => {
                const value = lander.fields[field];
                const label = LANDER_FIELD_LABEL[field];
                return (
                  <div key={field} className={styles.row}>
                    <dt>{label}</dt>
                    <dd>
                      {value.value === null ? null : (
                        <span className={styles.value}>{landerValueText(field, value)}</span>
                      )}
                      <StatusTag quiet={value.value === null}>{value.tag}</StatusTag>
                      {value.source ? (
                        <a
                          className={styles.source}
                          href={value.source}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Source of the ${label} (opens in a new tab)`}
                        >
                          source
                        </a>
                      ) : null}
                      {mentionsConflict(value) && value.note ? (
                        <span className={styles.note}>{value.note}</span>
                      ) : null}
                    </dd>
                  </div>
                );
              })}
            </dl>
            <p className={styles.legend}>
              Tags: S opened source · S* seen on a secondary page · D derived · A team assumption ·
              not published: no source gives it.
            </p>
          </>
        ) : null}

        <p
          className={joinClassNames(
            styles.verdict,
            result.kind === 'survives' && styles.ok,
            result.kind === 'doesnt' && styles.fail,
          )}
          data-testid="night-verdict"
        >
          <strong>{title}</strong>{' '}
          {verdictDetail(result, {
            batteryWh: lander?.fields.batteryWh.value ?? null,
            heaterW: lander?.fields.heaterW.value ?? null,
            heaterAssumed: lander?.fields.heaterW.tag === 'A',
          })}
        </p>
        <p className={styles.needed}>{batteryNeededText(loadW, dark, within)}</p>

        {slope && slope.value !== null ? (
          <p className={styles.slope}>
            Lander spec: touchdown slope up to {slope.value}° ({slope.tag})
            {slope.source ? (
              <>
                {' '}
                <a
                  className={styles.source}
                  href={slope.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Source of the touchdown slope spec (opens in a new tab)"
                >
                  source
                </a>
              </>
            ) : null}
            . Information only, not a check.
          </p>
        ) : null}
      </div>
    </Collapsible>
  );
}
