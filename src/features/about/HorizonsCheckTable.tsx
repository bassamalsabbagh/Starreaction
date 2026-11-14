import { useId } from 'react';
import { SITES } from '../../services/sites';
import { joinClassNames } from '../../utils/classNames';
import { formatClock } from '../../utils/time';
import { HORIZONS_CHECK, type HorizonsCheck } from './horizonsCheck';
import styles from './HorizonsCheckTable.module.css';

/** "IM-1 Odysseus" for "im1"; the id itself for a site not in the list. */
function siteName(id: string): string {
  return SITES.find((site) => site.id === id)?.name ?? id;
}

const degrees = (value: number) => `${value.toFixed(4)}°`;

function Result({ pass }: { pass: boolean }) {
  return (
    <span className={joinClassNames(styles.result, pass ? styles.pass : styles.fail)}>
      {pass ? 'Pass' : 'Fail'}
    </span>
  );
}

/**
 * "Checked against JPL Horizons" on the About page (docs/LANDER_RULES.md): (a) our engine against
 * the Horizons API files, (b) the daylight and Earth-up flags in Ayah's web-app exports, (c) the
 * exports' elevation columns, each row with its result. Read from src/data/horizonsCheck.json.
 */
export function HorizonsCheckTable({ check = HORIZONS_CHECK }: { check?: HorizonsCheck | null }) {
  const titleId = useId();
  if (!check) return null;
  const limit = degrees(check.limitDeg).replace(/0+°$/, '°');
  return (
    <section className={styles.check} aria-labelledby={titleId} data-testid="horizons-check">
      <h3 id={titleId} className={styles.title}>
        Checked against JPL Horizons
      </h3>
      <p className={styles.note}>
        {check.allPass ? 'All checks pass.' : 'Not every check passes: see the rows marked Fail.'}{' '}
        Generated {formatClock(Date.parse(check.generatedUtc))} by{' '}
        <code>npm run horizons:check</code>; the full report is docs/HORIZONS_CHECK.md.
      </p>

      <div className={styles.scroll}>
        <table className={styles.table}>
          <caption className={styles.caption}>
            (a) Our engine against the JPL Horizons API files, {check.engineDays}; a difference
            above {limit} fails.
          </caption>
          <thead>
            <tr>
              <th scope="col">Site</th>
              <th scope="col">Body</th>
              <th scope="col">Largest elevation difference</th>
              <th scope="col">Mean elevation difference</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {check.engine.map((row) => (
              <tr key={`${row.site}-${row.body}`}>
                <td>{siteName(row.site)}</td>
                <td>{row.body === 'sun' ? 'Sun' : 'Earth'}</td>
                <td>{degrees(row.maxDiffDeg)}</td>
                <td>{degrees(row.meanDiffDeg)}</td>
                <td>
                  <Result pass={row.pass} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.scroll}>
        <table className={styles.table}>
          <caption className={styles.caption}>
            (b) The daylight and Earth-up flags in the Horizons web-app exports, against the API
            data at the same time.
          </caption>
          <thead>
            <tr>
              <th scope="col">File</th>
              <th scope="col">Compared</th>
              <th scope="col">Agree</th>
              <th scope="col">Disagree</th>
              <th scope="col">Close calls (judged)</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {check.flags.map((row) => (
              <tr key={row.file}>
                <td>
                  {row.file}
                  <span className={styles.sub}>
                    {siteName(row.site)} · {row.target}
                  </span>
                </td>
                <td>{row.rows}</td>
                <td>{row.agree}</td>
                <td>{row.disagree}</td>
                <td>{row.nearHorizon}</td>
                <td>
                  <Result pass={row.pass} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.note}>
        Horizons sets these flags from the top edge (upper limb) of the Sun&apos;s or the
        Earth&apos;s disc, so every row is judged by the upper limb: the centre&apos;s elevation
        plus the disc&apos;s angular radius. Rows with the centre within {check.nearHorizonDeg}° of
        the horizon are counted as close calls, and judged too.
      </p>

      <div className={styles.scroll}>
        <table className={styles.table}>
          <caption className={styles.caption}>
            (c) The elevation columns in the exports, against the API data; a difference above{' '}
            {limit} fails.
          </caption>
          <thead>
            <tr>
              <th scope="col">File</th>
              <th scope="col">Largest difference</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {check.elevations.map((row) => (
              <tr key={row.file}>
                <td>
                  {row.file}
                  <span className={styles.sub}>{siteName(row.site)}</span>
                </td>
                <td>{degrees(row.maxDiffDeg)}</td>
                <td>
                  <Result pass={row.pass} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
