import { StatusTag } from '../../components/StatusTag';
import { coordStatus, isTodoSource, outcomeStatus, type Site } from '../../services/sites';
import { SOUTH_POLE, formatKm, haversineKm } from '../../utils/distance';
import { formatLandingDate, formatSiteCoordinates } from './siteFormat';
import styles from './SiteFacts.module.css';

/**
 * After a value: a "source" link to where it comes from (a new tab), or "source TODO" while its
 * record has no link yet.
 */
function SourceTag({ status, url, what }: { status: string; url: string; what: string }) {
  if (status === 'source TODO') return <span className={styles.todo}>source TODO</span>;
  return (
    <a
      className={styles.source}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Source of the ${what} (opens in a new tab)`}
    >
      source
    </a>
  );
}

/**
 * A real landing site's record on its card (its region is the line under the name): why it is in
 * the tool, where it is (with the record's note on the coordinates, if any), when it landed, and
 * the landing and mission outcomes as two separate fields, each linked to its own source.
 */
export function SiteFacts({ site }: { site: Site }) {
  return (
    <div className={styles.facts} role="group" aria-label="The landing">
      <p className={styles.why}>
        <span className={styles.whyLabel}>Why it’s here (team note):</span> {site.why}
      </p>
      <dl className={styles.list}>
        <div className={styles.row}>
          <dt>Coordinates</dt>
          <dd>
            {formatSiteCoordinates(site)}
            <SourceTag status={coordStatus(site)} url={site.coordSource} what="coordinates" />
            {site.coordNote ? <span className={styles.note}>{site.coordNote}</span> : null}
          </dd>
        </div>
        <div className={styles.row}>
          <dt>From the south pole</dt>
          <dd>
            {formatKm(haversineKm(site, SOUTH_POLE))}
            <StatusTag>Calculated</StatusTag>
          </dd>
        </div>
        <div className={styles.row}>
          <dt>Landed</dt>
          <dd>
            {formatLandingDate(site.landingDateUtc)} (UTC)
            <SourceTag
              status={isTodoSource(site.landingDateSource) ? 'source TODO' : 'sourced'}
              url={site.landingDateSource}
              what="landing date"
            />
          </dd>
        </div>
        <div className={styles.row}>
          <dt>Landing outcome</dt>
          <dd>
            {site.landingOutcome}
            <SourceTag
              status={outcomeStatus(site, 'landing')}
              url={site.landingOutcomeSource}
              what="landing outcome"
            />
          </dd>
        </div>
        <div className={styles.row}>
          <dt>Mission outcome</dt>
          <dd>
            {site.missionOutcome}
            <SourceTag
              status={outcomeStatus(site, 'mission')}
              url={site.missionOutcomeSource}
              what="mission outcome"
            />
          </dd>
        </div>
      </dl>
    </div>
  );
}
