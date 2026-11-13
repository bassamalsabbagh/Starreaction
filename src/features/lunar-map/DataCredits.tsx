import { DEMO_LABEL } from '../../data/demoData';
import { HORIZONS_INDEX } from '../../services/horizonsData';
import { MAP_LAYERS } from '../../services/mapLayers';
import { SITES } from '../../services/sites';
import { formatDayMonth } from '../../utils/time';
import { IMAGERY_CREDIT, LROC_CREDIT, MOON_TREK_URL, type ImageryStatus } from './mapLabels';
import { MOON_KIT_CREDIT } from './moonLook';
import styles from './DataCredits.module.css';

/** "IM-1 Odysseus, IM-2 Athena and Chandrayaan-3 Vikram". */
const SITE_NAMES = SITES.map((site) => site.name)
  .join(', ')
  .replace(/, ([^,]*)$/, ' and $1');

/** "1 Nov 2026". */
const dateText = (ms: number) => `${formatDayMonth(ms)} ${new Date(ms).getUTCFullYear()}`;

/** "from 1 Nov 2026 to 31 Dec 2027", the dates the Horizons files cover; null without them. */
const HORIZONS_DATES = HORIZONS_INDEX
  ? `from ${dateText(HORIZONS_INDEX.startMs)} to ${dateText(HORIZONS_INDEX.startMs + (HORIZONS_INDEX.count - 1) * HORIZONS_INDEX.stepMinutes * 60_000)}`
  : null;

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
          <a href={MOON_TREK_URL} target="_blank" rel="noopener noreferrer">
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
          {HORIZONS_DATES
            ? `At the landing sites ${HORIZONS_DATES}: JPL Horizons (NASA/JPL), every 10 minutes. Elsewhere, and for any clicked point, computed`
            : 'Computed'}{' '}
          with astronomy-engine 2.1.19 (MIT licence), checked against NASA/JPL Horizons to within
          0.01°. Smooth Moon, no terrain shadows.
        </span>
      </li>
      {MAP_LAYERS ? (
        <li>
          <span className={styles.strong}>Map layers: elevation and slope</span>
          <span>
            Team raster ({MAP_LAYERS.sourceId}; origin to be recorded), 80° S to the pole: values at
            40 m around IM-1 and IM-2 and 160 m elsewhere (the mean of 4 × 4 pixels), drawn in the
            team&apos;s colours. Fixed in time.
          </span>
        </li>
      ) : null}
      <li>
        <span className={styles.strong}>Earth image: NASA Earth Observatory</span>
        <span>Blue Marble: Next Generation (December 2004), shown small in the space view.</span>
      </li>
      <li>
        <span className={styles.strong}>Demo missions</span>
        <span>
          Demo Missions A, B and C are made up for practice ({DEMO_LABEL}): their Sun and Earth
          heights, days of power and relay are not sourced. The power and comms checks and the
          windows apply them to the real Sun and Earth. Missions you add hold your own values.
        </span>
      </li>
      <li>
        <span className={styles.strong}>Landing sites</span>
        <span>
          Real landings: {SITE_NAMES} (data/sites.json). A value still waiting for its source link
          is marked &ldquo;source TODO&rdquo; on the site&apos;s card.
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
