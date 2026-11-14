import styles from './Breadcrumb.module.css';

interface BreadcrumbProps {
  /** The chosen location's name or coordinates, or null before one is chosen. */
  locationName: string | null;
  /** The mission's name, or null before a valid mission is entered. */
  missionName: string | null;
  /** Which crumb is the current wizard step: the Moon (nothing yet), the location or the mission. */
  current: 'moon' | 'location' | 'mission';
  /** Back to the Location step. */
  onLocation: () => void;
  /** Back to the Mission step. */
  onMission: () => void;
}

/** Where you are in the wizard: "Moon › location › mission". Each crumb opens its step. */
export function Breadcrumb({
  locationName,
  missionName,
  current,
  onLocation,
  onMission,
}: BreadcrumbProps) {
  const here = (level: BreadcrumbProps['current']) => (current === level ? 'location' : undefined);
  return (
    <nav className={styles.crumbs} aria-label="Breadcrumb">
      <ol className={styles.list}>
        <li className={styles.item}>
          <button
            type="button"
            className={styles.crumb}
            onClick={onLocation}
            aria-current={here('moon')}
          >
            Moon
          </button>
        </li>
        {locationName === null ? null : (
          <li className={styles.item}>
            <button
              type="button"
              className={styles.crumb}
              onClick={onLocation}
              aria-current={here('location')}
            >
              {locationName}
            </button>
          </li>
        )}
        {missionName === null ? null : (
          <li className={styles.item}>
            <button
              type="button"
              className={styles.crumb}
              onClick={onMission}
              aria-current={here('mission')}
            >
              {missionName}
            </button>
          </li>
        )}
      </ol>
    </nav>
  );
}
