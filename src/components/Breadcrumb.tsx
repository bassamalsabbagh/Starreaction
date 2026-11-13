import styles from './Breadcrumb.module.css';

interface BreadcrumbProps {
  missionName: string;
  /** The level of the panel actually shown: none (the Moon), the mission, or a site or point. */
  current: 'moon' | 'mission' | 'site';
  /** The selected site or point, or null for none. */
  siteName: string | null;
  /** "Moon": clear the selection and show the ranked Sites. */
  onMoon: () => void;
  /** The mission: open the mission picker. */
  onMission: () => void;
  /** The site: show its card. */
  onSite: () => void;
}

/** Where you are: "Moon › mission › site". Each step is a button back to that level. */
export function Breadcrumb({
  missionName,
  current,
  siteName,
  onMoon,
  onMission,
  onSite,
}: BreadcrumbProps) {
  const here = (level: BreadcrumbProps['current']) => (current === level ? 'location' : undefined);
  return (
    <nav className={styles.crumbs} aria-label="Breadcrumb">
      <ol className={styles.list}>
        <li className={styles.item}>
          <button
            type="button"
            className={styles.crumb}
            onClick={onMoon}
            aria-current={here('moon')}
          >
            Moon
          </button>
        </li>
        <li className={styles.item}>
          <button
            type="button"
            className={styles.crumb}
            onClick={onMission}
            aria-current={here('mission')}
            title="Change the mission"
          >
            {missionName}
          </button>
        </li>
        {siteName === null ? null : (
          <li className={styles.item}>
            <button
              type="button"
              className={styles.crumb}
              onClick={onSite}
              aria-current={here('site')}
            >
              {siteName}
            </button>
          </li>
        )}
      </ol>
    </nav>
  );
}
