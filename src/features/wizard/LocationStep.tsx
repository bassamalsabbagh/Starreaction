import type { Site } from '../../services/sites';
import type { LatLon } from '../../utils/lunarSky';
import { CoordinateSearch } from '../lunar-map/CoordinateSearch';
import { LOCATION_HINT } from './wizardSteps';
import styles from './Steps.module.css';

interface LocationStepProps {
  /** The four real landing sites, as "Past landings". */
  sites: readonly Site[];
  /** The coordinate box's text: a map click, a chip or typing fills it. */
  coordText: string;
  onCoordText: (text: string) => void;
  selectedSiteId: string | null;
  onSelectSite: (siteId: string) => void;
  onGoToPoint: (point: LatLon) => void;
}

/** Step 1: type coordinates, click the map, or take a past landing. */
export function LocationStep({
  sites,
  coordText,
  onCoordText,
  selectedSiteId,
  onSelectSite,
  onGoToPoint,
}: LocationStepProps) {
  return (
    <>
      <CoordinateSearch
        onGo={onGoToPoint}
        hint={LOCATION_HINT}
        value={coordText}
        onValueChange={onCoordText}
      />

      <section className={styles.group} aria-labelledby="past-landings">
        <h3 id="past-landings" className={styles.groupTitle}>
          Past landings
        </h3>
        <div className={styles.chips}>
          {sites.map((site) => (
            <button
              key={site.id}
              type="button"
              className={styles.chip}
              aria-pressed={selectedSiteId === site.id}
              onClick={() => onSelectSite(site.id)}
            >
              {site.name}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
