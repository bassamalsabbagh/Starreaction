import { LANDER_FIELDS, LANDER_FIELD_LABEL, LANDERS } from '../../services/landers';
import { SITES, isTodoSource } from '../../services/sites';
import styles from './SourcesList.module.css';

/** One link, or "source TODO" while a record has no opened source. */
function Link({ url, label }: { url: string; label: string }) {
  if (isTodoSource(url)) return <span className={styles.todo}>{label}: source TODO</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  );
}

/**
 * Every source in one place (About → Data and credits): the landing sites' coordinates and
 * outcomes, the landers' numbers, and the formulas' sources. The panels show only short status
 * tags; the full register is docs/DATA_SOURCES.md.
 */
export function SourcesList() {
  return (
    <section className={styles.sources} aria-labelledby="sources-title">
      <h3 id="sources-title" className={styles.title}>
        Sources
      </h3>

      <h4 className={styles.sub}>Landing sites: coordinates, date, outcomes</h4>
      <ul className={styles.list}>
        {SITES.map((site) => (
          <li key={site.id}>
            <span className={styles.strong}>{site.name}</span>{' '}
            <Link url={site.coordSource} label="coordinates" /> ·{' '}
            <Link url={site.landingDateSource} label="landing date" /> ·{' '}
            <Link url={site.landingOutcomeSource} label="landing outcome" /> ·{' '}
            <Link url={site.missionOutcomeSource} label="mission outcome" />
            {site.coordNote ? <span className={styles.note}> {site.coordNote}</span> : null}
          </li>
        ))}
      </ul>

      <h4 className={styles.sub}>Lander numbers</h4>
      <ul className={styles.list}>
        {LANDERS.map((lander) => (
          <li key={lander.id}>
            <span className={styles.strong}>{lander.name}</span>
            <ul className={styles.inner}>
              {LANDER_FIELDS.map((field) => {
                const value = lander.fields[field];
                return (
                  <li key={field}>
                    {LANDER_FIELD_LABEL[field]} ({value.tag}):{' '}
                    {value.source ? (
                      <a href={value.source} target="_blank" rel="noopener noreferrer">
                        source
                      </a>
                    ) : (
                      'no source'
                    )}
                    {value.note ? <span className={styles.note}> {value.note}</span> : null}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>

      <h4 className={styles.sub}>Formulas and data</h4>
      <ul className={styles.list}>
        <li>
          Sun and Earth up (upper limb, elevation + angular radius): JPL Horizons target radii (Sun
          695,700 km, Earth 6,378.137 km), NASA PGDA product 69. Rules: docs/LANDER_RULES.md.
        </li>
        <li>
          Power check: 1361 W/m² (NASA Moon Fact Sheet), 30% cells (NASA small-spacecraft report),
          143 Wh/kg derived from LuSEE-Night&apos;s planned battery (a team assumption for every
          mission).
        </li>
        <li>
          Elevation and slope layers: the team&apos;s rasters (origin to be recorded). Visibility
          layers: the team&apos;s preview grids (9.6 km, 2 m assumed height).
        </li>
        <li>
          The full register, with access dates and conflicts, is docs/DATA_SOURCES.md in the
          project.
        </li>
      </ul>
    </section>
  );
}
