import { useState, type FormEvent } from 'react';
import type { Site } from '../../services/sites';
import type { LatLon } from '../../utils/lunarSky';
import { CoordinateSearch } from '../lunar-map/CoordinateSearch';
import {
  SAVED_NAME_MAX,
  addSavedPlace,
  coordinateLabel,
  loadSavedPlaces,
  removeSavedPlace,
  storeSavedPlaces,
} from './savedPlaces';
import { LOCATION_HINT } from './wizardSteps';
import styles from './Steps.module.css';

interface LocationStepProps {
  /** The four real landing sites, as "Past landings". */
  sites: readonly Site[];
  /** The coordinate box's text: a map click, a chip or typing fills it. */
  coordText: string;
  onCoordText: (text: string) => void;
  /** The point the box holds now (a valid entry), or null: what "Save this place" saves. */
  point: LatLon | null;
  selectedSiteId: string | null;
  onSelectSite: (siteId: string) => void;
  onGoToPoint: (point: LatLon) => void;
}

/** Step 1: three ways to choose a place (click the Moon, a past landing, coordinates), then save it. */
export function LocationStep({
  sites,
  coordText,
  onCoordText,
  point,
  selectedSiteId,
  onSelectSite,
  onGoToPoint,
}: LocationStepProps) {
  const [places, setPlaces] = useState(loadSavedPlaces);
  // The name being typed for the place being saved; null while not saving.
  const [naming, setNaming] = useState<string | null>(null);
  const update = (next: ReturnType<typeof loadSavedPlaces>) => {
    setPlaces(next);
    storeSavedPlaces(next);
  };
  const saved = point ? places.some((place) => place.id === coordinateLabel(point)) : false;
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (point && naming !== null) update(addSavedPlace(places, naming, point));
    setNaming(null);
  };
  return (
    <>
      <section className={styles.group} aria-labelledby="way-click">
        <h3 id="way-click" className={styles.groupTitle}>
          Click anywhere on the Moon
        </h3>
      </section>

      <p className={styles.or}>or</p>

      <section className={styles.group} aria-labelledby="way-type">
        <h3 id="way-type" className={styles.groupTitle}>
          Type coordinates
        </h3>
        <CoordinateSearch
          onGo={onGoToPoint}
          hint={LOCATION_HINT}
          value={coordText}
          onValueChange={onCoordText}
          hideLabel
        />
      </section>

      <p className={styles.or}>or</p>

      <section className={styles.group} aria-labelledby="past-landings">
        <h3 id="past-landings" className={styles.groupTitle}>
          Pick a past landing
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

      {point ? (
        <div className={styles.saveRow}>
          {naming === null ? (
            <button
              type="button"
              className={styles.saveButton}
              disabled={saved}
              onClick={() => setNaming(coordinateLabel(point))}
            >
              {saved ? '★ Saved' : '☆ Save this place'}
            </button>
          ) : (
            <form className={styles.nameForm} onSubmit={save}>
              <label className={styles.help} htmlFor="saved-name">
                Name this place
              </label>
              <div className={styles.nameRow}>
                <input
                  id="saved-name"
                  className={styles.nameInput}
                  type="text"
                  autoComplete="off"
                  maxLength={SAVED_NAME_MAX}
                  value={naming}
                  onChange={(event) => setNaming(event.target.value)}
                />
                <button type="submit" className={styles.saveButton}>
                  Save
                </button>
                <button type="button" className={styles.saveButton} onClick={() => setNaming(null)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}

      {places.length > 0 ? (
        <section className={styles.group} aria-labelledby="saved-places">
          <h3 id="saved-places" className={styles.groupTitle}>
            Saved places
          </h3>
          <div className={styles.chips}>
            {places.map((place) => (
              <span key={place.id} className={styles.savedChip}>
                <button
                  type="button"
                  className={styles.savedName}
                  title={coordinateLabel(place)}
                  onClick={() => onGoToPoint({ lat: place.lat, lon: place.lon })}
                >
                  {place.name}
                </button>
                <button
                  type="button"
                  className={styles.savedRemove}
                  aria-label={`Remove ${place.name}`}
                  onClick={() => update(removeSavedPlace(places, place.id))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
