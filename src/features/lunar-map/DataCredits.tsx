import { DEMO_LABEL } from '../../data/demoData';
import { IMAGERY_CREDIT, LROC_CREDIT, MOON_TREK_URL, type ImageryStatus } from './mapLabels';
import { MOON_KIT_CREDIT } from './moonLook';
import styles from './DataCredits.module.css';

/** The map's data sources and credits, for the About panel's "Data and credits" tab. */
export function DataCredits({ imageryStatus }: { imageryStatus: ImageryStatus }) {
  return (
    <ul className={styles.list}>
      <li>
        <span className={styles.strong}>{MOON_KIT_CREDIT}</span>
        <span>CGI Moon Kit: LRO LROC WAC colour mosaic and LOLA elevation. Public domain.</span>
      </li>
      <li>
        <span className={styles.strong}>{IMAGERY_CREDIT}</span>
        <span>{LROC_CREDIT}</span>
        <span className={styles.note}>
          Close-ups only. Preview, not adopted: Moon Trek publishes no licence or attribution terms,
          so its licence is unconfirmed.{' '}
          <a href={MOON_TREK_URL} target="_blank" rel="noreferrer">
            Moon Trek
          </a>
        </span>
        {/* Said above already when it loads; this line only reports a failure. */}
        <span className={styles.note} role="status">
          {imageryStatus === 'failed'
            ? 'Close-up preview imagery could not load, so close-ups use the global 8K map.'
            : null}
        </span>
      </li>
      <li>
        <span className={styles.strong}>Sun and Earth positions</span>
        <span>
          Computed with astronomy-engine 2.1.19 (MIT licence), checked against NASA/JPL Horizons to
          within 0.01°. Smooth Moon, no terrain shadows.
        </span>
      </li>
      <li>
        <span className={styles.strong}>Earth image: NASA Earth Observatory</span>
        <span>Blue Marble: Next Generation (December 2004), shown small in the space view.</span>
      </li>
      <li>
        <span className={styles.strong}>Demo missions and sites</span>
        <span>
          Made up for practice ({DEMO_LABEL}). Nothing is sourced yet; the power and comms checks
          and the windows apply them to the real Sun and Earth. Missions you add hold your own
          values.
        </span>
      </li>
      <li>
        <span className={styles.strong}>Lessons from past landings</span>
        <span>Real missions: every fact is quoted from the sources listed on its card.</span>
      </li>
      <li>
        <span className={styles.strong}>Sources register</span>
        <span>Every source, with its access date: docs/DATA_SOURCES.md.</span>
      </li>
    </ul>
  );
}
