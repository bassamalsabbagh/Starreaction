/**
 * DEMO DATA - NOT REAL.
 *
 * Practice-only fixtures that exist so the whole UI can be exercised. Every mission profile, site
 * name, coordinate and threshold below is made up. Nothing here is sourced, and nothing here
 * describes a real lander, mission or place. The UI labels all of it "DEMO". Real data must never
 * be added to this file; it belongs in sourced datasets that reference docs/DATA_SOURCES.md.
 *
 * Only the Sun and Earth are real: each site's sunlight, Earth visibility and windows are computed
 * from their actual positions (src/utils/skyVisibility.ts) at these made-up sites, with these
 * made-up minimum heights (docs/LANDER_RULES.md).
 */
import { bestWindow, type SiteSky } from '../utils/skyVisibility';
import { tenthsOfDayDown, type TimeRange, type TimeWindowMs } from '../utils/time';

export const DEMO_LABEL = 'DEMO - NOT REAL';

/** The top bar's "Data: Demo" pill explains itself with this. */
export const DEMO_NOTICE =
  'Mission profiles and sites are made up for practice; the Sun and Earth positions are real. Map imagery is a preview, not adopted. Not affiliated with or endorsed by NASA.';

/**
 * What a mission needs from the sky: the Sun high enough for its solar panels, for long enough,
 * and the Earth high enough to talk to directly (unless it has a relay).
 */
export interface DemoMission {
  readonly id: string;
  readonly name: string;
  /** The Sun counts as up for power at or above this elevation, in degrees. Made up. */
  readonly minSunElevationDeg: number;
  /** The Earth counts as up (direct-to-Earth contact) at or above this, in degrees. Made up. */
  readonly minEarthElevationDeg: number;
  /** Made-up days of unbroken power the mission needs (Sun up, and Earth up without a relay). */
  readonly daysNeeded: number;
  /** Made-up: talks to Earth through a relay, so it does not need to see the Earth itself. */
  readonly hasRelay: boolean;
  /** Set on a mission the user made ("Add your own mission"): its values are theirs, not DEMO. */
  readonly custom?: boolean;
}

export interface DemoSite {
  readonly id: string;
  readonly name: string;
  /** Made-up selenographic coordinates (provisional convention, see COORDINATE_CONVENTION). */
  readonly lat: number;
  readonly lon: number;
}

export const DEFAULT_DEMO_MISSION: DemoMission = {
  id: 'demo-mission-a',
  name: 'Demo Mission A',
  minSunElevationDeg: 5,
  minEarthElevationDeg: 5,
  daysNeeded: 3,
  hasRelay: false,
};

export const DEMO_MISSIONS: readonly DemoMission[] = [
  DEFAULT_DEMO_MISSION,
  {
    id: 'demo-mission-b',
    name: 'Demo Mission B',
    minSunElevationDeg: 1,
    minEarthElevationDeg: 1,
    daysNeeded: 6,
    hasRelay: true,
  },
  {
    id: 'demo-mission-c',
    name: 'Demo Mission C',
    minSunElevationDeg: 10,
    minEarthElevationDeg: 10,
    daysNeeded: 2,
    hasRelay: false,
  },
];

export const DEMO_SITES: readonly DemoSite[] = [
  { id: 'demo-site-alpha', name: 'Demo Site Alpha', lat: 12.4, lon: -31.8 },
  { id: 'demo-site-bravo', name: 'Demo Site Bravo', lat: -8.2, lon: 45.6 },
  { id: 'demo-site-charlie', name: 'Demo Site Charlie', lat: 26.9, lon: -64.2 },
  { id: 'demo-site-delta', name: 'Demo Site Delta', lat: -41.3, lon: 12.7 },
  { id: 'demo-site-echo', name: 'Demo Site Echo', lat: 3.6, lon: 101.5 },
  { id: 'demo-site-foxtrot', name: 'Demo Site Foxtrot', lat: -63.9, lon: -128.4 },
  { id: 'demo-site-golf', name: 'Demo Site Golf', lat: 54.2, lon: 160.3 },
  { id: 'demo-site-hotel', name: 'Demo Site Hotel', lat: -19.7, lon: -84.9 },
  // Near the south pole, so the Sun skims the horizon and the Earth dips below it for part of
  // each month (libration): the conditions the challenge is about.
  { id: 'demo-site-india', name: 'Demo Site India', lat: -85.5, lon: 31 },
];

/**
 * The checks every place gets, in the order they are checked (docs/LANDER_RULES.md, "The
 * checks"): Power is the Sun only, Comms the Earth only, Usable window both at once. A mission
 * with a relay has no separate usable-window check: for it the window is the power stretch.
 */
export type CheckId = 'sunlight' | 'earth' | 'window';

export interface SkyCheck {
  readonly id: CheckId;
  /** "Power", "Comms" or "Usable window". */
  readonly label: string;
  readonly passes: boolean;
  /** The value behind it, in plain words. */
  readonly detail: string;
  /** The short reason when it fails ("Not enough sunlight for its power"). */
  readonly failTitle: string;
}

/** What the real Sun and Earth mean for one mission at one place over the range. */
export interface SkyAssessment {
  readonly sky: SiteSky;
  /** The usable window inside the range, in days: Sun and Earth both up (Sun only with a relay). */
  readonly usableDays: number;
  readonly checks: readonly SkyCheck[];
  readonly suitable: boolean;
  /** The short reasons for each failed check, in check order; empty when suitable. */
  readonly failTitles: readonly string[];
  /** The window with the most time inside the range, or null. */
  readonly bestWindow: TimeWindowMs | null;
}

export interface RankedDemoSite {
  readonly site: DemoSite;
  readonly assessment: SkyAssessment;
  /** 1-based place among suitable sites in the current order; null when not suitable. */
  readonly rank: number | null;
}

/** "4.5 days": one decimal, rounded down, so a near miss reads as one ("2.9 days … under 3"). */
export function formatDays(days: number): string {
  return `${tenthsOfDayDown(days)} days`;
}

/** "56%", or "<1%" for a share above 0 that rounds to it (so it never reads as none). */
export function formatShare(pct: number): string {
  return pct > 0 && pct < 0.5 ? '<1%' : `${Math.round(pct)}%`;
}

/**
 * The checks for one place, from its real sky over the range (docs/LANDER_RULES.md, "The checks").
 * Power: the longest unbroken stretch with the Sun at or above the mission's minimum must last the
 * days it needs. Comms: without a relay, the Earth must rise to the mission's minimum at some point.
 * Usable window (without a relay): the longest stretch with both up must last the days it needs.
 */
export function assessSky(sky: SiteSky, mission: DemoMission, range: TimeRange): SkyAssessment {
  const usableDays = mission.hasRelay ? sky.longestSunlitDays : sky.longestWindowDays;
  const checks: SkyCheck[] = [
    {
      id: 'sunlight',
      label: 'Power',
      passes: sky.longestSunlitDays >= mission.daysNeeded,
      detail: `Longest sunlit stretch: ${formatDays(sky.longestSunlitDays)} (needs ${mission.daysNeeded}), Sun at least ${mission.minSunElevationDeg}° up`,
      failTitle: 'Not enough sunlight for its power',
    },
    {
      id: 'earth',
      label: 'Comms',
      passes: mission.hasRelay || sky.earthPct > 0,
      detail: mission.hasRelay
        ? `Relay: no need to see the Earth (Earth up ${formatShare(sky.earthPct)} of the month)`
        : `Earth at least ${mission.minEarthElevationDeg}° up for ${formatShare(sky.earthPct)} of the month`,
      failTitle: 'No line of sight to Earth',
    },
  ];
  if (!mission.hasRelay) {
    checks.push({
      id: 'window',
      label: 'Usable window',
      passes: sky.longestWindowDays >= mission.daysNeeded,
      detail: `Longest stretch with the Sun and Earth both up: ${formatDays(sky.longestWindowDays)} (needs ${mission.daysNeeded})`,
      failTitle: 'Not enough time with Sun and Earth both up',
    });
  }
  const failTitles = checks.filter((check) => !check.passes).map((check) => check.failTitle);
  return {
    sky,
    usableDays,
    checks,
    suitable: failTitles.length === 0,
    failTitles,
    bestWindow: bestWindow(sky.windows, range),
  };
}

/** How the Sites list is ordered. */
export type SiteOrder = 'window' | 'sunlight' | 'earth' | 'name';

export const SITE_ORDER_LABEL: Readonly<Record<SiteOrder, string>> = {
  window: 'Longest window',
  sunlight: 'Most sunlight',
  earth: 'Most Earth time',
  name: 'Name',
};

/** The value each order sorts on, highest first (names sort A–Z instead). */
function orderValue(order: Exclude<SiteOrder, 'name'>, assessment: SkyAssessment): number {
  switch (order) {
    case 'window':
      return assessment.usableDays;
    case 'sunlight':
      return assessment.sky.sunPct;
    case 'earth':
      return assessment.sky.earthPct;
  }
}

/**
 * Suitable sites first, in the chosen order (ties by name), numbered 1…n; then the sites that are
 * not suitable, in the same order, with no number. `sky` holds each site's real Sun and Earth over
 * the range (missing counts as none).
 */
export function rankDemoSites(
  sites: readonly DemoSite[],
  mission: DemoMission,
  sky: ReadonlyMap<string, SiteSky>,
  range: TimeRange,
  order: SiteOrder = 'window',
): readonly RankedDemoSite[] {
  const assessed = sites.map((site) => ({
    site,
    assessment: assessSky(sky.get(site.id) ?? NO_SKY, mission, range),
  }));
  const byOrder = (a: (typeof assessed)[number], b: (typeof assessed)[number]) =>
    order === 'name'
      ? a.site.name.localeCompare(b.site.name)
      : orderValue(order, b.assessment) - orderValue(order, a.assessment) ||
        a.site.name.localeCompare(b.site.name);
  const suitable = assessed.filter((entry) => entry.assessment.suitable).sort(byOrder);
  const unsuitable = assessed.filter((entry) => !entry.assessment.suitable).sort(byOrder);
  return [
    ...suitable.map((entry, index) => ({ ...entry, rank: index + 1 })),
    ...unsuitable.map((entry) => ({ ...entry, rank: null })),
  ];
}

/**
 * The best site: the suitable one with the longest usable window (ties by name), whatever order
 * the list is shown in; undefined when no site is suitable. "Best" always means this.
 */
export function bestDemoSite(ranked: readonly RankedDemoSite[]): RankedDemoSite | undefined {
  let best: RankedDemoSite | undefined;
  for (const entry of ranked) {
    if (entry.rank === null) continue;
    const diff = best ? entry.assessment.usableDays - best.assessment.usableDays : 1;
    if (!best || diff > 1e-9 || (Math.abs(diff) <= 1e-9 && entry.site.name < best.site.name)) {
      best = entry;
    }
  }
  return best;
}

const NO_SKY: SiteSky = {
  sunPct: 0,
  earthPct: 0,
  longestSunlitDays: 0,
  longestWindowDays: 0,
  windows: [],
};

export function findDemoMission(id: string): DemoMission | undefined {
  return DEMO_MISSIONS.find((mission) => mission.id === id);
}

/** One line for a place: "Power and comms OK for Demo Mission A", or what fails. */
export function verdictText(assessment: SkyAssessment, mission: DemoMission): string {
  if (assessment.suitable) return `Power and comms OK for ${mission.name}`;
  return `Not suitable for ${mission.name}: ${assessment.failTitles
    .map((title, index) => (index === 0 ? title : title.charAt(0).toLowerCase() + title.slice(1)))
    .join('; ')}`;
}
