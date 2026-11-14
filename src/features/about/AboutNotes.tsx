import { PREVIEW_LINE, VISIBILITY_LABEL, VISIBILITY_MEANING } from '../lunar-map/visibilityLayer';
import { LANDERS, LANDER_FIELD_LABEL, LANDER_FIELDS } from '../../services/landers';
import styles from './SourcesList.module.css';

/**
 * Explanations that used to sit in the map and Results panels (About → Data and credits): what the
 * layers and the terrain horizon are, and their limits.
 */
export function AboutNotes() {
  return (
    <section className={styles.sources} aria-labelledby="notes-title">
      <h3 id="notes-title" className={styles.title}>
        Notes on the map layers and results
      </h3>
      <ul className={styles.list}>
        <li>
          <span className={styles.strong}>Elevation and slope.</span> South pole only (80°S to
          90°S). They do not change with the date. Slope is the average over one pixel (160 m or 40
          m), not a pass or fail.
        </li>
        <li>
          <span className={styles.strong}>Sun visibility and Earth visibility.</span> {PREVIEW_LINE}{' '}
          {VISIBILITY_LABEL}. {VISIBILITY_MEANING} South pole only (80°S to 90°S). Frames cover 24
          Nov to 8 Dec 2026, every 10 minutes; at other times the layer says &ldquo;No frame for
          this time&rdquo;.
        </li>
        <li>
          <span className={styles.strong}>Terrain horizon (test).</span> Only IM-1 and IM-2 have a
          terrain horizon. Every other place is checked against a smooth Moon, so crater rims and
          hills are not counted.
        </li>
        <li>
          <span className={styles.strong}>Power and battery.</span> Sunlight 1361 W/m² (NASA Moon
          Fact Sheet) and 30% cells (NASA small-spacecraft report); 143 Wh/kg from LuSE-Night&apos;s
          planned battery, a team assumption for every mission. Panel power is for a flat 1 m² panel
          and is 0 while the Sun is down. A simplified model: no shadows or terrain, no panel losses
          (heat, dust, wiring, pointing), only the night load (heater plus electronics) runs at
          night, and the battery figure is a minimum with no reserve. Information only: it never
          changes a check.
        </li>
        {LANDERS.map((lander) => {
          const notes = LANDER_FIELDS.flatMap((field) => {
            const value = lander.fields[field];
            return value.note ? [`${LANDER_FIELD_LABEL[field]}: ${value.note}`] : [];
          });
          return notes.length > 0 ? (
            <li key={lander.id}>
              <span className={styles.strong}>Lander values: {lander.name}.</span> {notes.join(' ')}
            </li>
          ) : null;
        })}
        <li>
          <span className={styles.strong}>Moon Power Lab: battery and panel calculator.</span> How
          big a battery does a lander need to survive the Moon night? It opens from Power Lab in the
          menu, in a new tab, and does not change any result in the app.
        </li>
        <li>
          <span className={styles.strong}>Phones.</span> On a phone the layers use lower-resolution
          images, because the full ones need more memory than a phone has.
        </li>
      </ul>
    </section>
  );
}
