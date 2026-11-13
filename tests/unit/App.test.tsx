import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import indexHtml from '../../index.html?raw';
import { App } from '../../src/app/App';
import { DOCUMENT_TITLE, NON_ENDORSEMENT } from '../../src/app/appInfo';
import {
  DEMO_LABEL,
  findDemoMission,
  formatDays,
  rankSites,
  type SiteOrder,
} from '../../src/data/demoData';
import { LANDING_LESSONS } from '../../src/data/landingLessons';
import { checkPoint } from '../../src/data/pointCheck';
import { slipSummary } from '../../src/features/missions/slipSummary';
import { ENGINE_LABEL } from '../../src/features/lunar-map/horizonsPositions';
import { viewInHorizonsUrl } from '../../src/services/horizonsQuery';
import { SITES } from '../../src/services/sites';
import { SOUTH_POLE, formatKm, haversineKm } from '../../src/utils/distance';
import { TOUR_STEPS } from '../../src/features/tour/tourSteps';
import { describeElevation, type LatLon } from '../../src/utils/lunarSky';
import { bodyNow, forecastText, type SkyBody } from '../../src/utils/riseSet';
import { hourlySky, sampledSpan, siteSky } from '../../src/utils/skyVisibility';
import type { TimeRange } from '../../src/utils/time';
import { UI_PREFS_KEY, loadUiPrefs } from '../../src/utils/uiPrefs';
import {
  DAY_MS,
  currentOrNextWindow,
  dayCentre,
  dayTicks,
  formatClock,
  formatDayMonth,
  formatRangeUtc,
  formatWindowLength,
  rangeAround,
} from '../../src/utils/time';

vi.mock('../../src/features/lunar-map/MoonGlobe', () => import('../mocks/MoonGlobe'));
// The "Launch slipped?" assistant is a future plan, off by default; these tests switch it on
// (VITE_SLIP_ASSISTANT=on) to keep it working. AppSlipOff.test.tsx covers the default.
vi.mock('../../src/app/featureFlags', () => ({ SLIP_ASSISTANT_ENABLED: true }));
// Load the map's stand-in once up front (see tests/unit/AppLoading.test.tsx).
beforeAll(async () => {
  await import('../mocks/MoonGlobe');
});
// These tests use the smooth-Moon demo fixture, whatever terrain data is loaded; the terrain rule
// has its own tests (tests/unit/utils/skyVisibility.test.ts, tests/unit/data/terrainPatches.test.ts).
vi.mock('../../src/data/terrainPatches', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/data/terrainPatches')>()),
  terrainProfileFor: () => null,
}));
// And our engine for the Sun and Earth, as the expected values below are worked out: the JPL
// Horizons files are not loaded here (their use has its own tests: horizonsPositions, riseSet,
// useHorizonsSeries, slipQuestion). One empty map, so the app sees the same one every render.
vi.mock('../../src/features/lunar-map/useHorizonsSeries', () => {
  const none = { series: new Map(), settled: false };
  return { useHorizonsSeries: () => none };
});

const NOW = '2026-11-15T02:00:00Z';

/** Freezes the clock (Date only; timers stay real) at a moment chosen for the demo windows. */
function freezeTime(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

// The checks and windows come from the real Sun and Earth over the range around the app time, so
// every test starts at one fixed moment (15 Nov 2026, 02:00 UTC) unless it sets its own.
beforeEach(() => {
  freezeTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------- What the app should show, worked out the way the app does ----------

function mission(id = 'demo-mission-a') {
  const found = findDemoMission(id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

const RANGE = rangeAround(dayCentre(Date.parse(NOW)));

/** The sites as the app lists them now (real Sun and Earth), for a mission and order. */
function expectedSites(
  missionId = 'demo-mission-a',
  order: SiteOrder = 'window',
  range: TimeRange = RANGE,
) {
  const chosen = mission(missionId);
  const samples = hourlySky(sampledSpan(range));
  const sky = new Map(SITES.map((site) => [site.id, siteSky(samples, site, chosen, range)]));
  return rankSites(SITES, chosen, sky, range, order);
}

/** "Sun 333 h · Earth 708 h · both 333 h", as a Sites row shows a site's hours. */
function hoursText(entry: ReturnType<typeof expectedSites>[number]) {
  const { sky } = entry.assessment;
  const h = (value: number) => `${value.toLocaleString('en-US')} h`;
  return `Sun ${h(sky.sunHours)} · Earth ${h(sky.earthHours)} · both ${h(sky.bothHours)}`;
}

function topSite(missionId = 'demo-mission-a') {
  const first = expectedSites(missionId)[0];
  if (!first || first.rank === null) throw new Error('no suitable site now');
  return first;
}

function unsuitableCount(missionId = 'demo-mission-a') {
  return expectedSites(missionId).filter((entry) => entry.rank === null).length;
}

/** The status line's text for the Sun or Earth at a place now. */
function skyChip(place: LatLon, body: SkyBody) {
  const now = bodyNow(place, body, Date.parse(NOW));
  const name = body === 'sun' ? 'Sun' : 'Earth';
  const next = now.next ? ` · ${forecastText(body, now.next, Date.parse(NOW))}` : '';
  return `${describeElevation(name, now.elevationDeg)}${next}`;
}

/** A text matcher: exactly one of the real sites' names. */
const isSiteName = (text: string) => SITES.some((site) => site.name === text);

/** The Power check's night-load slider (heater plus electronics; never "Heater"). */
const NIGHT_LOAD = /^Night load \(heater \+ electronics\)/;

/** What the Comms check says under it, once: Earth in view is geometry, not a working link. */
const COMMS_NOTE =
  'Earth in view means a direct link is geometrically possible; it does not guarantee the radio link works.';

// ---------- Finding things on screen ----------

/**
 * The map is lazy-loaded, so wait for it before touching map-dependent UI. Its first, cold load can
 * take several seconds when the whole suite runs at once, so this wait is longer than the default.
 */
const GLOBE_WAIT_MS = 15_000;

async function renderApp() {
  render(<App />);
  await screen.findByTestId('moon-globe', {}, { timeout: GLOBE_WAIT_MS });
}

async function mapMarker(name: string) {
  const markers = await screen.findAllByTestId('map-marker');
  const marker = markers.find((entry) => entry.textContent === name);
  if (!marker) throw new Error(`${name} marker missing`);
  return marker;
}

function crumbs() {
  return within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getAllByRole('button');
}

/** A menu rail item. Compare's name also carries how many sites are picked. */
function railItem(name: string) {
  return within(screen.getByRole('navigation', { name: 'Menu' })).getByRole('button', {
    name: new RegExp(`^${name}(, \\d+ picked)?$`),
  });
}

/** Opens a view from the rail, unless it is already showing (a second click would close it). */
function openRail(name: string) {
  const item = railItem(name);
  if (item.getAttribute('aria-expanded') !== 'true') fireEvent.click(item);
}

/** The Mission view (picker, needs, "Add your own mission"). */
function missionView() {
  const shown = screen.queryByRole('region', { name: 'Mission' });
  if (shown) return shown;
  const formClose = screen.queryByRole('button', { name: 'Close the mission form' });
  if (formClose) fireEvent.click(formClose);
  else openRail('Mission');
  return screen.getByRole('region', { name: 'Mission' });
}

function missionSelect() {
  return within(missionView()).getByRole('combobox', { name: 'Mission' });
}

/**
 * Picks a demo mission. Mission C needs the Sun 10° up, which it never reaches at IM-2 Athena
 * (84.8° S): the real site that is not suitable in these tests (all four suit Mission A).
 */
function pickMission(id: string) {
  fireEvent.change(missionSelect(), { target: { value: id } });
}

/** Sites (the default view): back from a card, or from the rail. */
function plan() {
  const shown = screen.queryByRole('complementary', { name: 'Sites' });
  if (shown) return shown;
  const back = screen.queryByRole('button', { name: 'All sites' });
  if (back) fireEvent.click(back);
  else openRail('Sites');
  return screen.getByRole('complementary', { name: 'Sites' });
}

/** The selected site's card: opened from the breadcrumb's site when it is not showing. */
function details() {
  const shown = screen.queryByRole('complementary', { name: 'Site details' });
  if (shown) return shown;
  const site = crumbs()[2];
  if (!site) throw new Error('no site selected');
  fireEvent.click(site);
  return screen.getByRole('complementary', { name: 'Site details' });
}

function pointCard() {
  return screen.getByRole('complementary', { name: 'Anywhere on the Moon' });
}

function rankedRows() {
  const list = within(plan()).getByRole('list', { name: 'Ranked sites' });
  // The site rows, not the compare toggle beside each one.
  return within(list).getAllByRole('button', { name: /^Rank \d+:/ });
}

function siteRow(name: string) {
  return within(plan()).getByRole('button', { name: new RegExp(`^(?!Compare ).*${name}`) });
}

function section(container: HTMLElement, name: string | RegExp) {
  return within(container).getByRole('button', { name });
}

function strip() {
  return screen.getByRole('group', { name: 'Status' });
}

function clock() {
  return within(strip()).getByRole('button', { name: /^Time: / });
}

function timeBar() {
  return screen.getByRole('group', { name: 'Time bar' });
}

/** Starts the guided demo from About. */
function watchDemo() {
  fireEvent.click(screen.getByRole('button', { name: 'About' }));
  fireEvent.click(screen.getByRole('button', { name: 'Watch the short demo' }));
}

/** Stubs matchMedia for a window of the given width (only min/max-width queries are used). */
function stubWidth(width: number) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => {
      const max = /max-width:\s*(\d+)px/.exec(query);
      const min = /min-width:\s*(\d+)px/.exec(query);
      const matches =
        (max === null || width <= Number(max[1])) && (min === null || width >= Number(min[1]));
      return { matches };
    }),
  );
}

// ---------- Tests ----------

describe('App layout', () => {
  it('names the product once, in the top bar, matching the tab title', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(DOCUMENT_TITLE);
    expect(indexHtml).toContain(`<title>${DOCUMENT_TITLE}</title>`);
    expect(indexHtml).toContain('href="/src/assets/starreaction-mark.png"');
  });

  it('shows one logo, in the top bar: no brand badge on the map', () => {
    render(<App />);
    expect(screen.getByRole('main', { name: 'Lunar map' })).not.toHaveTextContent('StarReaction');
    expect(screen.getByRole('banner')).toHaveTextContent('StarReaction');
  });

  it('keeps ctrl+wheel (touchpad pinch) over the map from zooming the browser page', () => {
    render(<App />);
    expect(fireEvent.wheel(timeBar(), { ctrlKey: true, deltaY: -6 })).toBe(false);
    expect(fireEvent.wheel(timeBar(), { deltaY: 100 })).toBe(true);
  });

  it('orders the DOM top row, rail, panel, map, so Tab follows the screen', () => {
    render(<App />);
    const regions = [
      screen.getByRole('banner'),
      screen.getByRole('navigation', { name: 'Menu' }),
      screen.getByRole('complementary', { name: 'Sites' }),
      screen.getByRole('main', { name: 'Lunar map' }),
    ];
    for (let i = 1; i < regions.length; i++) {
      const previous = regions[i - 1];
      const current = regions[i];
      if (!previous || !current) throw new Error('region missing');
      expect(previous.compareDocumentPosition(current) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }
  });

  it('opens each view from the rail, marks the active one, and closes it on a second click', () => {
    render(<App />);
    expect(
      within(screen.getByRole('navigation', { name: 'Menu' }))
        .getAllByRole('button')
        .map((item) => item.textContent),
    ).toEqual(['Mission', 'Sites', 'Compare', 'Lessons', 'Demo', 'About']);
    expect(railItem('Sites')).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(railItem('Mission'));
    expect(railItem('Mission')).toHaveAttribute('aria-expanded', 'true');
    expect(railItem('Sites')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('region', { name: 'Mission' })).toBeInTheDocument();
    fireEvent.click(railItem('Lessons'));
    expect(screen.getByRole('region', { name: 'Lessons from past landings' })).toBeInTheDocument();
    fireEvent.click(railItem('Compare'));
    expect(screen.getByRole('region', { name: 'Compare sites' })).toBeInTheDocument();
    // The active item again: the panel slides away, and is remembered so.
    fireEvent.click(railItem('Compare'));
    expect(screen.queryByRole('region', { name: 'Compare sites' })).not.toBeInTheDocument();
    expect(railItem('Compare')).toHaveAttribute('aria-expanded', 'false');
    expect(loadUiPrefs().panelClosed).toBe(true);
    fireEvent.click(railItem('About'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('slides the panel away and back with its handle, and remembers it', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide the panel' }));
    expect(screen.queryByRole('complementary', { name: 'Sites' })).not.toBeInTheDocument();
    expect(loadUiPrefs().panelClosed).toBe(true);
    cleanup();
    render(<App />);
    expect(screen.queryByRole('complementary', { name: 'Sites' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show the panel' }));
    expect(screen.getByRole('complementary', { name: 'Sites' })).toBeInTheDocument();
    expect(loadUiPrefs().panelClosed).toBe(false);
  });

  it('keeps the breadcrumb in step with the rail and the panel shown', () => {
    render(<App />);
    const top = topSite();
    const current = () => crumbs().find((crumb) => crumb.hasAttribute('aria-current'));
    expect(crumbs().map((crumb) => crumb.textContent)).toEqual([
      'Moon',
      'Demo Mission A',
      top.site.name,
    ]);
    expect(current()).toHaveTextContent('Moon');
    // The site crumb: its card (the rail's Sites stays active).
    fireEvent.click(crumbs()[2] as HTMLElement);
    expect(current()).toHaveTextContent(top.site.name);
    expect(railItem('Sites')).toHaveAttribute('aria-expanded', 'true');
    // The mission crumb: the Mission view, its picker focused.
    fireEvent.click(crumbs()[1] as HTMLElement);
    expect(missionSelect()).toHaveFocus();
    expect(current()).toHaveTextContent('Demo Mission A');
    // Moon: no site, the Sites list; the time bar shows the best site's windows, by name.
    fireEvent.click(crumbs()[0] as HTMLElement);
    expect(screen.getByRole('complementary', { name: 'Sites' })).toBeInTheDocument();
    expect(crumbs()).toHaveLength(2);
    expect(timeBar()).toHaveTextContent(`Landing windows · Best site: ${top.site.name}`);
  });

  it('enters presentation mode from the map column or H; leaves with Exit, H or Escape', async () => {
    await renderApp();
    const enter = screen.getByRole('button', { name: 'Presentation mode' });
    fireEvent.click(enter);
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Menu' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Time bar' })).toBeInTheDocument();
    expect(screen.getByTestId('present-label')).toHaveTextContent(
      `${topSite().site.name}Power and comms OK this monthDEMO mission`,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Exit presentation' }));
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByTestId('present-label-layer')).toHaveAttribute('aria-hidden', 'true');

    const exit = () => screen.queryByRole('button', { name: 'Exit presentation' });
    fireEvent.keyDown(document.body, { key: 'h' });
    expect(exit()).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(exit()).not.toBeInTheDocument();
    // H in a form field or with Ctrl does nothing.
    fireEvent.keyDown(missionSelect(), { key: 'h' });
    fireEvent.keyDown(document.body, { key: 'h', ctrlKey: true });
    expect(exit()).not.toBeInTheDocument();
  });

  it('shows the H hint once, to a returning visitor who has not seen it', async () => {
    window.localStorage.setItem(UI_PREFS_KEY, JSON.stringify({ tourDone: true }));
    render(<App />);
    expect(await screen.findByText(/for presentation mode/)).toBeInTheDocument();
    expect(loadUiPrefs().keyHintSeen).toBe(true);
  });
});

describe('Keyboard', () => {
  it('skips straight to the timeline from the first Tab stop', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip to the timeline' }));
    expect(timeBar()).toHaveFocus();
  });

  it('hands focus to the panel handle when Escape closes the panel around it', () => {
    render(<App />);
    const firstRow = rankedRows()[0];
    if (!firstRow) throw new Error('no ranked rows');
    firstRow.focus();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Show the panel' })).toHaveFocus();
  });

  it('says how many sites are picked on the rail’s Compare', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: `Compare ${topSite().site.name}` }));
    expect(railItem('Compare')).toHaveAccessibleName('Compare, 1 picked');
  });
});

describe('The left panel by screen width', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens Sites on desktop screens', () => {
    stubWidth(1366);
    render(<App />);
    expect(screen.getByRole('complementary', { name: 'Sites' })).toBeInTheDocument();
  });

  it('starts narrow screens on the Moon and the rail', () => {
    stubWidth(600);
    render(<App />);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    fireEvent.click(siteRow(topSite().site.name));
    expect(within(details()).getByRole('heading', { name: topSite().site.name })).toBeVisible();
  });
});

describe('Demo labelling and the About panel', () => {
  it('has no "Data: Demo" pill; the mission picker says the needs are made up, the sites real', () => {
    render(<App />);
    expect(screen.queryByRole('button', { name: /Data: Demo/ })).toBeNull();
    const view = missionView();
    expect(view).toHaveTextContent('DEMO These needs are made up for practice.');
    expect(view).toHaveTextContent('The sites are real landings');
  });

  it('opens About from the rail; Escape closes it and gives focus back', () => {
    render(<App />);
    const info = screen.getByRole('button', { name: 'About' });
    info.focus();
    fireEvent.click(info);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('tab', { name: 'About' })).toHaveFocus();
    expect(dialog).toHaveTextContent('NASA Space Apps 2026 - Amman');
    expect(dialog).toHaveTextContent('sunlight for power and the Earth in view');
    expect(dialog).toHaveTextContent('the sites are real landings');
    expect(dialog).toHaveTextContent(NON_ENDORSEMENT);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(info).toHaveFocus();
  });

  it('lists the credits in About: the imagery, the demo missions and the real landing sites', () => {
    render(<App />);
    fireEvent.click(railItem('About'));
    fireEvent.click(screen.getByRole('tab', { name: 'Data and credits' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Imagery: NASA/JPL Moon Trek')).toBeVisible();
    expect(dialog).toHaveTextContent(DEMO_LABEL);
    expect(dialog).toHaveTextContent('Demo Missions A, B and C are made up for practice');
    expect(dialog).toHaveTextContent(
      'Real landings: IM-1 Odysseus, IM-2 Athena, Blue Ghost Mission 1 and Chandrayaan-3 Vikram',
    );
    expect(dialog).not.toHaveTextContent(/demo sites|sites are made up/i);
  });

  it('explains the power and comms checks, and that only the mission needs are made up', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'About' }));
    fireEvent.click(screen.getByRole('tab', { name: 'How it works' }));
    const panel = screen.getByRole('tabpanel');
    expect(
      within(panel)
        .getAllByRole('listitem')
        .map((item) => item.textContent?.split(':')[0]),
    ).toEqual(['Power', 'Comms', 'Usable window']);
    expect(panel).toHaveTextContent('the dates you pick in the Mission view');
    expect(panel).toHaveTextContent('hours of Sun, of Earth or of both');
    expect(panel).toHaveTextContent('JPL Horizons at the four landing sites');
    expect(panel).toHaveTextContent('our engine (astronomy-engine) for clicked points');
    expect(panel).toHaveTextContent('The Sun and Earth positions are real');
    expect(panel).toHaveTextContent('the sites are real landings');
    expect(panel).toHaveTextContent("The demo missions' needs are made up for practice");
    expect(panel).not.toHaveTextContent(/score out of 100/);
  });

  it('marks what is done and what is planned on the roadmap; arrow keys move tabs', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'About' }));
    fireEvent.keyDown(screen.getByRole('tab', { name: 'About' }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('tab', { name: 'How it works' }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Roadmap' })).toHaveFocus();
    const items = within(screen.getByRole('tabpanel')).getAllByRole('listitem');
    expect(items[1]).toHaveTextContent(/^Done\s*Time to sunset and Earthset/);
    expect(items[4]).toHaveTextContent(
      /^Planned\s*Launch slipped\? Describe the change.*future plan/,
    );
    expect(items[5]).toHaveTextContent(/^Done\s*Real landing sites/);
    expect(items[6]).toHaveTextContent(/^Planned\s*Terrain horizons at the south pole/);
  });

  it('opens Lessons from the About footer', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'About' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lessons from past landings' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Lessons from past landings' })).toBeInTheDocument();
  });

  it('says close-ups fall back to the global map when the preview tiles fail', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'simulate tiles failed' }));
    fireEvent.click(railItem('About'));
    fireEvent.click(screen.getByRole('tab', { name: 'Data and credits' }));
    expect(within(screen.getByRole('dialog')).getByRole('status')).toHaveTextContent(
      'close-ups use the global 8K map',
    );
  });
});

describe('Mission', () => {
  it('picks one of three demo missions, shows its needs, and re-checks the sites', () => {
    render(<App />);
    expect(within(missionSelect()).getAllByRole('option')).toHaveLength(3);
    const needs = within(missionView()).getByRole('list', { name: 'Demo Mission A needs' });
    expect(
      within(needs)
        .getAllByRole('listitem')
        .map((chip) => chip.textContent),
    ).toEqual(['Sun for power≥ 5°', 'Power needed3 days', 'Earth for contact≥ 5°']);
    fireEvent.change(missionSelect(), { target: { value: 'demo-mission-b' } });
    // Mission B has a relay: it never needs to see the Earth.
    expect(
      within(missionView()).getByRole('list', { name: 'Demo Mission B needs' }),
    ).toHaveTextContent('Relay');
    expect(rankedRows()).toHaveLength(
      expectedSites('demo-mission-b').filter((entry) => entry.rank !== null).length,
    );
  });

  it('opens "Add your own mission" as a form in the panel', () => {
    render(<App />);
    const add = within(missionView()).getByRole('button', { name: 'Add your own mission' });
    expect(add).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(add);
    expect(screen.getByRole('region', { name: 'Add your own mission' })).toBeInTheDocument();
  });
});

describe('Sites', () => {
  it('lists the suitable sites best first, #1 with its best window and the month', () => {
    render(<App />);
    const expected = expectedSites();
    const suitable = expected.filter((entry) => entry.rank !== null);
    expect(rankedRows()).toHaveLength(suitable.length);
    const top = topSite();
    const first = rankedRows()[0];
    expect(first).toHaveAccessibleName(new RegExp(`^Rank 1: ${top.site.name}, usable this month `));
    const window = top.assessment.bestWindow;
    if (!window) throw new Error('no best window');
    // The whole window, and (when it runs past the month) the part inside it: the row's number.
    expect(first).toHaveTextContent(
      `Best window ${formatRangeUtc(window.start, window.end)} · ${formatWindowLength(window, RANGE)}`,
    );
    expect(first).toHaveTextContent(formatDays(top.assessment.usableDays).replace(' days', ' d'));
    expect(first).toHaveTextContent(/This month Sun up \d+% · Earth up \d+%/);
    expect(plan()).toHaveTextContent('Demo Mission A');
    expect(plan()).toHaveTextContent(
      `${suitable.length} of ${SITES.length} landing sites suitable`,
    );
    expect(plan()).not.toHaveTextContent(/DEMO site/i);
  });

  it('shows how much of the mission needs each site meets, in the list and Site details', () => {
    render(<App />);
    const top = topSite();
    const first = rankedRows()[0];
    const ratio = Math.floor((top.assessment.usableDays / mission().daysNeeded) * 10 + 1e-9) / 10;
    expect(first).toHaveTextContent(`${ratio}× what it needs`);
    const month = within(details()).getByRole('group', { name: 'This month' });
    expect(month).toHaveTextContent(`Mission needs met`);
    expect(month).toHaveTextContent(`× what it needs`);
    pickMission('demo-mission-c');
    fireEvent.click(section(plan(), `Not suitable (${unsuitableCount('demo-mission-c')})`));
    const unsuitable = within(plan())
      .getAllByRole('button', { pressed: false })
      .filter((button) => button.textContent?.includes('Not suitable for this mission'));
    expect(unsuitable.length).toBeGreaterThan(0);
    for (const row of unsuitable)
      expect(row).toHaveTextContent(/\d+% of needs met · [\d.]+ d short/);
  });

  it('reorders by hours of Sun, of Earth, of both, or name', () => {
    render(<App />);
    const order = within(plan()).getByRole('group', { name: 'Order sites by' });
    expect(within(order).getByRole('button', { name: 'Longest window' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(within(order).getByRole('button', { name: 'Name' }));
    expect(within(order).getByRole('button', { name: 'Name' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const byName = expectedSites('demo-mission-a', 'name').filter((entry) => entry.rank !== null);
    expect(rankedRows()[0]).toHaveTextContent(byName[0]?.site.name ?? 'missing');
    expect(
      within(order)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([
      'Longest window',
      'Most hours of Sun',
      'Most hours of Earth',
      'Most hours of both',
      'Name',
    ]);
    fireEvent.click(within(order).getByRole('button', { name: 'Most hours of Earth' }));
    const byEarth = expectedSites('demo-mission-a', 'earthHours').filter(
      (entry) => entry.rank !== null,
    );
    expect(rankedRows()[0]).toHaveAccessibleName(
      new RegExp(`^Rank 1: ${byEarth[0]?.site.name ?? 'missing'}, of Earth [\\d,]+ h, `),
    );
    fireEvent.click(within(order).getByRole('button', { name: 'Most hours of both' }));
    const byBoth = expectedSites('demo-mission-a', 'bothHours').filter(
      (entry) => entry.rank !== null,
    );
    expect(rankedRows()[0]).toHaveTextContent(byBoth[0]?.site.name ?? 'missing');
  });

  it('shows each site’s hours of Sun, of Earth and of both in the range', () => {
    render(<App />);
    const top = topSite();
    expect(rankedRows()[0]).toHaveTextContent(hoursText(top));
  });

  it('keeps unsuitable sites folded, each with its reasons', () => {
    render(<App />);
    pickMission('demo-mission-c');
    const count = unsuitableCount('demo-mission-c');
    const toggle = section(plan(), `Not suitable (${count})`);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    // IM-2 Athena (84.8° S): the Sun never climbs to Mission C's 10°.
    const athena = siteRow('IM-2 Athena');
    expect(athena).toHaveTextContent('Not suitable for this mission');
    expect(athena).toHaveTextContent('Not enough sunlight for its power');
  });

  it('opens Not suitable when an unsuitable site is chosen on the map', async () => {
    await renderApp();
    pickMission('demo-mission-c');
    fireEvent.click(await mapMarker('IM-2 Athena'));
    expect(section(plan(), `Not suitable (${unsuitableCount('demo-mission-c')})`)).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(siteRow('IM-2 Athena')).toHaveAttribute('aria-pressed', 'true');
  });

  it('goes to typed coordinates: the point card opens and the map flies there', async () => {
    await renderApp();
    const search = within(plan()).getByRole('search', { name: 'Go to coordinates' });
    const box = within(search).getByRole('textbox', { name: 'Go to coordinates' });
    fireEvent.change(box, { target: { value: 'hello' } });
    fireEvent.click(within(search).getByRole('button', { name: 'Go' }));
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(search).toHaveTextContent(/Coordinates must be numbers/);
    fireEvent.change(box, { target: { value: '85.5 S, 31 E' } });
    fireEvent.click(within(search).getByRole('button', { name: 'Go' }));
    expect(
      within(pointCard()).getByRole('heading', { level: 3, name: '85.5° S, 31.0° E' }),
    ).toBeVisible();
    expect(screen.getByTestId('moon-globe').dataset.flyPoint).toBe('-85.5,31');
  });

  it('highlights a site both ways: row hover grows its beacon', async () => {
    await renderApp();
    const row = rankedRows()[0];
    if (!row) throw new Error('no rows');
    fireEvent.mouseEnter(row);
    expect((await mapMarker(topSite().site.name)).dataset.hovered).toBe('true');
    fireEvent.mouseLeave(row);
    expect((await mapMarker(topSite().site.name)).dataset.hovered).toBe('false');
  });
});

describe('Site card', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
  });

  it('selects the best site on load and says whether the mission gets power and comms', () => {
    render(<App />);
    const top = topSite();
    const card = details();
    expect(within(card).getByRole('heading', { level: 3, name: top.site.name })).toBeVisible();
    expect(card).toHaveTextContent('#1');
    expect(card).not.toHaveTextContent('DEMO site');
    expect(card).toHaveTextContent(
      top.site.region ? `Landing site · ${top.site.region}` : 'Landing site',
    );
    expect(card).toHaveTextContent('Power and comms OK for Demo Mission A');
    expect(card).not.toHaveTextContent(/\/100|Great|Poor/);
  });

  it('shows the landing: why, coordinates, date, and both outcomes as separate fields', () => {
    render(<App />);
    const { site } = topSite();
    const landing = within(details()).getByRole('group', { name: 'The landing' });
    expect(landing).toHaveTextContent(site.why);
    expect(landing).toHaveTextContent('Coordinates');
    expect(landing).toHaveTextContent('Landed');
    expect(landing).toHaveTextContent(`Landing outcome${site.landingOutcome}`);
    expect(landing).toHaveTextContent(`Mission outcome${site.missionOutcome}`);
  });

  it('links each site’s coordinates and outcomes to their sources, with any note on the coordinates', () => {
    render(<App />);
    for (const site of SITES) {
      fireEvent.click(siteRow(site.name));
      const landing = within(details()).getByRole('group', { name: 'The landing' });
      const sources = [
        site.coordSource,
        site.landingDateSource,
        site.landingOutcomeSource,
        site.missionOutcomeSource,
      ];
      const todo = sources.filter((source) => /^TODO\b/i.test(source)).length;
      expect(within(landing).queryAllByRole('link', { name: /^Source of the / })).toHaveLength(
        sources.length - todo,
      );
      expect(within(landing).queryAllByText('source TODO')).toHaveLength(todo);
      if (site.coordNote) expect(landing).toHaveTextContent(site.coordNote);
    }
  });

  it('shows the Sun and Earth now, with a forecast of when each sets or rises', () => {
    render(<App />);
    const top = topSite();
    const now = within(details()).getByRole('group', { name: 'The Sun and Earth now' });
    let forecasts = 0;
    for (const body of ['sun', 'earth'] as const) {
      const state = bodyNow(top.site, body, Date.parse(NOW));
      if (state.next) {
        forecasts += 1;
        expect(now).toHaveTextContent(forecastText(body, state.next, Date.parse(NOW)));
      }
    }
    expect(forecasts).toBeGreaterThan(0);
    expect(now).toHaveTextContent(/Forecast: (dark|Sun rises|Earth sets|Earth rises) in \d+ [dhm]/);
  });

  it('draws the horizon view, the best window, the month and the checks', () => {
    render(<App />);
    const top = topSite();
    const card = details();
    const chart = within(card).getByRole('img', {
      name: /The Sun and Earth over the horizon this month/,
    });
    expect(chart).toBeInTheDocument();
    expect(card).toHaveTextContent('Flat horizon: no terrain data for this site');
    const window = currentOrNextWindow(top.assessment.sky.windows, Date.parse(NOW));
    if (!window) throw new Error('no window');
    const bar = within(card).getByTestId('window-bar');
    expect(bar).toHaveTextContent(`Opens ${formatDayMonth(window.start)}`);
    const month = within(card).getByRole('group', { name: 'This month' });
    expect(month).toHaveTextContent(/Sun up\s*\d+% of the month/);
    expect(month).toHaveTextContent(/Earth up\s*\d+% of the month/);
    const checks = within(card).getByRole('list', { name: 'Checks for Demo Mission A' });
    expect(
      within(checks)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringMatching(/^PowerOK.*Longest sunlit stretch/),
      expect.stringMatching(/^CommsOK/),
      expect.stringMatching(/^Usable windowOK.*Sun and Earth both up/),
    ]);
    // One line under Comms, and only there.
    expect(within(card).getAllByText(COMMS_NOTE)).toHaveLength(1);
    expect(within(checks).getAllByRole('listitem')[1]).toHaveTextContent(COMMS_NOTE);
  });

  it("shows Miral's Power check: information only, with teaching sliders", () => {
    render(<App />);
    const card = details();
    const toggle = section(card, /^Power check/);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    const check = within(card).getByTestId('power-check');
    expect(check).toHaveTextContent('Miral’s');
    expect(check).toHaveTextContent('It doesn’t change the checks.');
    // The results show at once; the sliders wait, folded, under "Power details".
    expect(within(check).getByTestId('power-verdict')).toBeInTheDocument();
    expect(within(check).getByText('Panel power now')).toBeInTheDocument();
    const detailsToggle = section(check, /^Power details/);
    expect(detailsToggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(detailsToggle);
    expect(check).toHaveTextContent('Teaching defaults');
    expect(check).toHaveTextContent('A simplified model: no shadows, no panel losses');
    expect(within(check).getByRole('slider', { name: /Panel area/ })).toHaveValue('1');
    expect(within(check).getByRole('slider', { name: NIGHT_LOAD })).toHaveValue('20');
    // The night load is heater plus electronics: never "Heater".
    expect(check.textContent).not.toContain('Heater');
    expect(within(check).getByRole('slider', { name: /Battery/ })).toHaveValue('30');
    // A big heater through a lunar night needs more battery than the slider's 200 kg can give.
    fireEvent.change(within(check).getByRole('slider', { name: NIGHT_LOAD }), {
      target: { value: '100' },
    });
    fireEvent.change(within(check).getByRole('slider', { name: /Battery/ }), {
      target: { value: '5' },
    });
    // "at least" when the longest night reaches the edge of the month (a lower bound).
    expect(within(check).getByTestId('power-verdict')).toHaveTextContent(
      /^Needs (at least )?[\d.]+ kg more$/,
    );
    // The verdict never touches the checks.
    expect(within(card).getByRole('list', { name: 'Checks for Demo Mission A' })).toHaveTextContent(
      'PowerOK',
    );
  });

  it('lists other dates for the same site, and Go moves the time there', () => {
    render(<App />);
    const card = details();
    const toggle = section(card, /^Other dates/);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    const months = within(card).getByRole('list', {
      name: 'Best window in each of the next months',
    });
    expect(within(months).getAllByRole('listitem')).toHaveLength(6);
    expect(months).toHaveTextContent('This month');
    const go = within(months).getAllByRole('button', { name: /^Go to / })[1];
    if (!go) throw new Error('no second month');
    fireEvent.click(go);
    expect(strip()).toHaveTextContent('Simulated');
    expect(clock()).not.toHaveTextContent('15 Nov 2026 · 02:00 UTC');
  });

  it('explains why a site is not suitable', () => {
    render(<App />);
    pickMission('demo-mission-c');
    fireEvent.click(section(plan(), `Not suitable (${unsuitableCount('demo-mission-c')})`));
    fireEvent.click(siteRow('IM-2 Athena'));
    const card = details();
    expect(card).toHaveTextContent('Not suitable for Demo Mission C');
    expect(card).toHaveTextContent(/not enough sunlight for its power/i);
    expect(within(card).getByRole('list', { name: 'Checks for Demo Mission C' })).toHaveTextContent(
      /PowerFails/,
    );
  });

  it('shares the mission, site and exact time in the link, and says "Link copied"', async () => {
    const writeText = vi.fn<(url: string) => Promise<void>>(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } });
    render(<App />);
    fireEvent.click(within(details()).getByRole('button', { name: 'Share' }));
    expect(await within(details()).findByText('Link copied.')).toBeInTheDocument();
    const url = String(writeText.mock.calls[0]?.[0]);
    expect(url).toContain(`#mission=demo-mission-a&site=${topSite().site.id}&t=`);
  });

  it('shares a custom mission as the default one, and says so', async () => {
    const writeText = vi.fn<(url: string) => Promise<void>>(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } });
    render(<App />);
    fireEvent.click(within(missionView()).getByRole('button', { name: 'Add your own mission' }));
    const form = screen.getByRole('region', { name: 'Add your own mission' });
    fireEvent.change(within(form).getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Mine' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Use without saving' }));
    fireEvent.click(within(details()).getByRole('button', { name: 'Share' }));
    expect(
      await within(details()).findByText(
        'Link copied. Your own missions are not shared: the link opens with Demo Mission A.',
      ),
    ).toBeInTheDocument();
  });

  it('opens a shared link on its site and mission, simulated at its exact time', () => {
    const at = Date.parse('2026-12-01T10:00:00Z');
    window.history.replaceState(
      null,
      '',
      `/#mission=demo-mission-b&site=ch3&t=${new Date(at).toISOString()}`,
    );
    render(<App />);
    expect(within(details()).getByRole('heading', { name: 'Chandrayaan-3 Vikram' })).toBeVisible();
    expect(crumbs()[1]).toHaveTextContent('Demo Mission B');
    expect(strip()).toHaveTextContent(/Simulated/i);
    expect(clock()).toHaveAccessibleName(`Time: ${formatClock(at)}. Change the time`);
  });
});

describe('Time', () => {
  it('shows the mission, a live clock, and the Sun and Earth with sunset and Earthset', () => {
    render(<App />);
    const top = topSite();
    expect(strip()).toHaveTextContent('Demo Mission A');
    expect(strip()).toHaveTextContent('Live');
    expect(clock()).toHaveTextContent('15 Nov 2026 · 02:00 UTC');
    expect(strip()).toHaveTextContent(skyChip(top.site, 'sun'));
    expect(strip()).toHaveTextContent(skyChip(top.site, 'earth'));
  });

  it('edits the time in a popover: errors inline, applies on Enter, cancels on Escape', () => {
    render(<App />);
    fireEvent.click(clock());
    const popover = screen.getByRole('dialog', { name: 'Set the time (UTC)' });
    const date = within(popover).getByLabelText('Date');
    const time = within(popover).getByLabelText('Time (HH:MM)');
    fireEvent.change(date, { target: { value: '1985-06-01' } });
    fireEvent.submit(date.closest('form') ?? popover);
    expect(within(popover).getByRole('alert')).toHaveTextContent(
      'Choose a date from 1 Jan 1990 to 31 Dec 2100.',
    );
    fireEvent.change(date, { target: { value: '2026-11-20' } });
    fireEvent.change(time, { target: { value: '10:30' } });
    fireEvent.submit(date.closest('form') ?? popover);
    expect(clock()).toHaveTextContent('20 Nov 2026 · 10:30 UTC');
    expect(strip()).toHaveTextContent('Simulated');
    fireEvent.click(within(strip()).getByRole('button', { name: 'Now' }));
    expect(strip()).toHaveTextContent('Live');
  });

  it("counts down to the selected site's window, and jumps to its start on click", () => {
    render(<App />);
    const window = currentOrNextWindow(topSite().assessment.sky.windows, Date.parse(NOW));
    if (!window) throw new Error('no window');
    const countdown = within(timeBar()).getByRole('button', { name: /^Window (opens|open)/ });
    fireEvent.click(countdown);
    expect(clock()).toHaveTextContent(formatClock(window.start));
    // Mission C needs the Sun 10° up: never at IM-2 Athena (84.8° S), so it has no window.
    pickMission('demo-mission-c');
    fireEvent.click(section(plan(), /^Not suitable \(\d+\)$/));
    fireEvent.click(siteRow('IM-2 Athena'));
    expect(timeBar()).toHaveTextContent('No window in this range');
    expect(timeBar()).toHaveTextContent('Landing windows · IM-2 Athena');
  });

  it('steps, plays, labels the days and folds the time bar', () => {
    render(<App />);
    const bar = timeBar();
    expect(within(bar).getAllByRole('button')[0]).toHaveAccessibleName('Play');
    fireEvent.click(within(bar).getByRole('button', { name: 'Forward 1 day' }));
    expect(clock()).toHaveTextContent('16 Nov 2026 · 02:00 UTC');
    for (const tick of dayTicks(rangeAround(dayCentre(Date.parse('2026-11-16T02:00:00Z')))).filter(
      (entry) => entry.index % 3 === 0,
    )) {
      expect(bar).toHaveTextContent(tick.label);
    }
    fireEvent.click(within(bar).getByRole('button', { name: 'Play' }));
    fireEvent.click(within(bar).getByRole('button', { name: 'Pause' }));
    fireEvent.click(within(bar).getByRole('button', { name: 'Fold the time bar' }));
    expect(screen.getByRole('button', { name: 'Show the time bar' })).toHaveTextContent('Timeline');
    expect(loadUiPrefs().timeBarCollapsed).toBe(true);
  });
});

describe('Add your own mission', () => {
  function openForm() {
    fireEvent.click(within(missionView()).getByRole('button', { name: 'Add your own mission' }));
    return screen.getByRole('region', { name: 'Add your own mission' });
  }
  function fill(form: HTMLElement, name: string, values: Record<string, string> = {}) {
    fireEvent.change(within(form).getByRole('textbox', { name: 'Name' }), {
      target: { value: name },
    });
    for (const [label, value] of Object.entries(values)) {
      fireEvent.change(within(form).getByRole('spinbutton', { name: label }), {
        target: { value },
      });
    }
  }

  it('explains impossible values inline and keeps both actions off until valid', () => {
    render(<App />);
    const form = openForm();
    const use = within(form).getByRole('button', { name: 'Use without saving' });
    expect(use).toBeDisabled();
    fill(form, 'Test', { 'Days of power needed': '0' });
    expect(form).toHaveTextContent('It needs some power: above 0 days.');
    expect(use).toBeDisabled();
    fill(form, 'Test', { 'Days of power needed': '3', 'Lowest Sun height for power': '25' });
    expect(form).toHaveTextContent('Outside the DEMO range, 0 to 20°.');
    fill(form, 'Test', { 'Lowest Sun height for power': '5' });
    expect(use).toBeEnabled();
  });

  it('uses a mission without saving, re-checking live: needing 14 days of power rules out more', () => {
    render(<App />);
    const before = unsuitableCount();
    const form = openForm();
    fill(form, 'Long haul', { 'Days of power needed': '14' });
    fireEvent.click(within(form).getByRole('button', { name: 'Use without saving' }));
    expect(within(missionSelect()).getByRole('option', { selected: true })).toHaveTextContent(
      'Long haul · Custom',
    );
    const after = Number(/Not suitable \((\d+)\)/.exec(plan().textContent ?? '')?.[1] ?? 0);
    expect(after).toBeGreaterThan(before);
    cleanup();
    render(<App />);
    expect(within(missionSelect()).queryByRole('option', { name: /Long haul/ })).toBeNull();
  });

  it('saves presets that survive a reload, numbers duplicate names, renames and deletes', () => {
    render(<App />);
    let form = openForm();
    fill(form, 'Mine');
    fireEvent.click(within(form).getByRole('button', { name: 'Save as preset' }));
    form = openForm();
    fill(form, 'Mine');
    fireEvent.click(within(form).getByRole('button', { name: 'Save as preset' }));
    expect(within(missionSelect()).getByRole('option', { name: 'Mine (2) · Custom' })).toBeTruthy();
    cleanup();
    render(<App />);
    form = openForm();
    fireEvent.click(within(form).getByRole('button', { name: 'Rename Mine' }));
    fireEvent.change(within(form).getByRole('textbox', { name: 'New name for Mine' }), {
      target: { value: 'Renamed' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Save name' }));
    expect(within(missionSelect()).getByRole('option', { name: 'Renamed · Custom' })).toBeTruthy();
    form = openForm();
    fireEvent.click(within(form).getByRole('button', { name: 'Delete Renamed' }));
    expect(within(missionSelect()).queryByRole('option', { name: /Renamed/ })).toBeNull();
  });

  it('moves the time bar to a typed UTC date: the by-hand way to handle a slip', () => {
    render(<App />);
    const form = openForm();
    fill(form, 'Slipped');
    const date = within(form).getByLabelText('New date (UTC)');
    fireEvent.change(within(form).getByLabelText('New time (UTC)'), { target: { value: '06:30' } });
    expect(form).toHaveTextContent('Enter a date too, or clear the time.');
    expect(within(form).getByRole('button', { name: 'Use without saving' })).toBeDisabled();
    fireEvent.change(date, { target: { value: '2027-03-15' } });
    expect(form).toHaveTextContent('Moves the time bar to 15 Mar 2027 · 06:30 UTC.');
    fireEvent.click(within(form).getByRole('button', { name: 'Use without saving' }));
    expect(clock()).toHaveTextContent('15 Mar 2027 · 06:30 UTC');
    expect(within(missionSelect()).getByRole('option', { selected: true })).toHaveTextContent(
      'Slipped · Custom',
    );
  });
});

describe('Launch slipped assistant', () => {
  const BLANK = {
    missionName: null,
    shift: null,
    date: null,
    range: null,
    powerDays: null,
    minSunDeg: null,
    minEarthDeg: null,
    relay: null,
    question: null,
    unclear: [],
  };
  const START = Date.parse(NOW);

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** The server function answers with this reading (no network, no AI). */
  function answer(reading: Record<string, unknown>) {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ reading: { ...BLANK, ...reading } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  function assistant() {
    return within(missionView()).getByRole('region', { name: 'Launch slipped?' });
  }

  function send(text: string) {
    const box = assistant();
    fireEvent.change(within(box).getByRole('textbox', { name: 'Describe the change' }), {
      target: { value: text },
    });
    fireEvent.click(within(box).getByRole('button', { name: 'Read it' }));
  }

  async function ask(text: string) {
    send(text);
    return screen.findByTestId('slip-read-back');
  }

  function selectedMission() {
    return within(missionSelect()).getByRole('option', { selected: true });
  }

  function missionForm() {
    return screen.getByRole('region', { name: 'Add your own mission' });
  }

  function field(form: HTMLElement, name: string) {
    return within(form).getByRole('spinbutton', { name });
  }

  it('reads a clicked example at once', async () => {
    const fetchMock = answer({ shift: { shift: 3, unit: 'weeks' } });
    render(<App />);
    openRail('Mission');
    const examples = within(assistant()).getByRole('group', { name: 'Examples to try' });
    fireEvent.click(within(examples).getByRole('button', { name: 'Launch slipped 3 weeks' }));
    expect(within(assistant()).getByRole('textbox', { name: 'Describe the change' })).toHaveValue(
      'Launch slipped 3 weeks',
    );
    const readBack = await screen.findByTestId('slip-read-back');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      text: 'Launch slipped 3 weeks',
    });
    expect(readBack).toHaveTextContent(formatClock(START + 21 * DAY_MS));
  });

  it('answers "when to land" from the app, and Go there opens that site at that time', async () => {
    answer({
      question: { about: 'when', siteName: null, from: { month: 'March', year: null }, to: null },
    });
    render(<App />);
    openRail('Mission');
    send('When is the best time to land in March?');
    const result = await screen.findByTestId('slip-answer');
    expect(screen.queryByTestId('slip-read-back')).not.toBeInTheDocument();
    expect(result).toHaveTextContent('When to land');
    expect(result).toHaveTextContent('Months checked1 Mar to 31 Mar 2027 (UTC)');
    expect(result).toHaveTextContent('no year in your text, so the next March was used');
    expect(result).toHaveTextContent('The AI only read your question.');

    const site = within(result).getByText(isSiteName, { selector: 'strong' }).textContent;
    const windowText = within(result).getByText(/ UTC$/, { selector: 'strong' }).textContent;
    expect(site).toBeTruthy();
    fireEvent.click(within(result).getByRole('button', { name: 'Go there' }));
    expect(crumbs()[2]).toHaveTextContent(String(site));
    expect(screen.getByRole('complementary', { name: 'Site details' })).toBeInTheDocument();
    expect(clock().textContent).not.toContain(formatClock(START));
    expect(String(windowText)).toContain('Mar');
  });

  it('says what it can read when the text has no change and no question', async () => {
    answer({ unclear: ['what is the weather'] });
    render(<App />);
    openRail('Mission');
    const readBack = await ask('what is the weather');
    expect(readBack).toHaveTextContent('Couldn’t read:');
    expect(readBack).toHaveTextContent(
      'I can read a change, like “Launch slipped 3 weeks”, or a question: when or where to land, days of sunlight at a site, the most Earth time, or whether a site passes',
    );
  });

  it('answers "which site has the most Earth time" from the app', async () => {
    answer({ question: { about: 'earth', siteName: null, from: null, to: null } });
    render(<App />);
    openRail('Mission');
    send('Which site has the most Earth time?');
    const result = await screen.findByTestId('slip-answer');
    expect(result).toHaveTextContent('Most Earth time');
    expect(result).toHaveTextContent(/Earth time\s*\d+% of the time/);
    expect(result).toHaveTextContent(`the most Earth time of ${SITES.length} sites`);
    expect(within(result).getByRole('button', { name: 'Go there' })).toBeInTheDocument();
  });

  it('answers "does X pass for Mission Y" with the checks and the needs met', async () => {
    answer({
      missionName: 'Demo Mission C',
      question: { about: 'passes', siteName: 'IM-2 Athena', from: null, to: null },
    });
    render(<App />);
    openRail('Mission');
    send('Does IM-2 Athena pass for Demo Mission C?');
    const result = await screen.findByTestId('slip-answer');
    expect(result).toHaveTextContent('Does it pass?');
    expect(result).toHaveTextContent('SiteIM-2 Athena');
    // IM-2 Athena (84.8° S): the Sun never climbs to Mission C's 10°.
    expect(result).toHaveTextContent(
      'Not suitable for Demo Mission C: Not enough sunlight for its power',
    );
    expect(result).toHaveTextContent(/Mission needs met\s*\d+% of needs met/);
  });

  it('answers for months that have ended, and says "in the past"', async () => {
    answer({
      question: { about: 'when', siteName: null, from: { month: 'March', year: 2025 }, to: null },
    });
    render(<App />);
    openRail('Mission');
    send('When was the best time to land in March 2025?');
    const result = await screen.findByTestId('slip-answer');
    expect(result).toHaveTextContent('1 Mar to 31 Mar 2025 (UTC)in the past');
  });

  it('shows the full UTC date before anything changes; Apply moves the time and the needs', async () => {
    const fetchMock = answer({ shift: { shift: 3, unit: 'weeks' }, powerDays: 6 });
    render(<App />);
    const text = 'Launch slipped 3 weeks and we now need 6 days of power.';
    const readBack = await ask(text);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ text });

    const to = START + 21 * DAY_MS;
    expect(readBack).toHaveTextContent('I read this as:');
    expect(readBack).toHaveTextContent(formatClock(to));
    expect(readBack).toHaveTextContent(`3 weeks later than ${formatClock(START)}`);
    expect(readBack).toHaveTextContent('Days of power needed3 days → 6 days');
    expect(readBack).toHaveTextContent('Lowest Sun height for power5° (unchanged)');
    // Nothing has changed yet.
    expect(clock()).toHaveTextContent(formatClock(START));
    expect(selectedMission()).toHaveTextContent('Demo Mission A');

    fireEvent.click(within(readBack).getByRole('button', { name: 'Apply' }));
    expect(clock()).toHaveTextContent(formatClock(to));
    expect(selectedMission()).toHaveTextContent('Demo Mission A (2) · Custom');
    expect(
      within(missionView()).getByRole('list', { name: 'Demo Mission A (2) needs' }),
    ).toHaveTextContent('6 days');

    // The fixed sentence, filled from the app's own checks over the new range.
    const range = rangeAround(dayCentre(to));
    const changed = {
      ...mission(),
      id: 'expected',
      name: 'Demo Mission A (2)',
      daysNeeded: 6,
      custom: true,
    };
    const samples = hourlySky(sampledSpan(range));
    const sky = new Map(SITES.map((site) => [site.id, siteSky(samples, site, changed, range)]));
    const expected = slipSummary(rankSites(SITES, changed, sky, range), changed, range);
    await waitFor(() =>
      expect(within(assistant()).getByRole('status')).toHaveTextContent(`Applied. ${expected}`),
    );
    expect(assistant()).toHaveTextContent('The AI only read your text.');
  });

  it('Edit opens the mission form with what was read, and nothing changes until it is used', async () => {
    answer({ shift: { shift: 3, unit: 'weeks' }, powerDays: 6 });
    render(<App />);
    const readBack = await ask('Launch slipped 3 weeks and we now need 6 days of power.');
    fireEvent.click(within(readBack).getByRole('button', { name: 'Edit' }));
    const form = missionForm();
    expect(form).toHaveTextContent('Filled in from your text. Check the values, then use them.');
    expect(within(form).getByRole('textbox', { name: 'Name' })).toHaveValue('Demo Mission A');
    expect(field(form, 'Days of power needed')).toHaveValue(6);
    expect(field(form, 'Lowest Sun height for power')).toHaveValue(5);
    expect(within(form).getByLabelText('New date (UTC)')).toHaveValue('2026-12-06');
    expect(within(form).getByLabelText('New time (UTC)')).toHaveValue('02:00');
    expect(clock()).toHaveTextContent(formatClock(START));

    fireEvent.click(within(form).getByRole('button', { name: 'Use without saving' }));
    expect(clock()).toHaveTextContent(formatClock(START + 21 * DAY_MS));
    expect(selectedMission()).toHaveTextContent('Demo Mission A (2) · Custom');

    // Opened the usual way afterwards, the form is blank again.
    fireEvent.click(within(missionView()).getByRole('button', { name: 'Add your own mission' }));
    expect(missionForm()).not.toHaveTextContent('Filled in from your text');
    expect(within(missionForm()).getByLabelText('New date (UTC)')).toHaveValue('');
  });

  it('switches to a mission named in the text, matched by the app', async () => {
    answer({ missionName: 'mission B', shift: { shift: 2, unit: 'weeks' } });
    render(<App />);
    const readBack = await ask('mission B slipped 2 weeks');
    expect(readBack).toHaveTextContent('MissionDemo Mission B (in your list)');
    fireEvent.click(within(readBack).getByRole('button', { name: 'Apply' }));
    expect(selectedMission()).toHaveTextContent('Demo Mission B');
    expect(clock()).toHaveTextContent(formatClock(START + 14 * DAY_MS));
  });

  it('an unknown mission: says so, and "Add its details" opens the form with only what was typed', async () => {
    answer({ missionName: 'IM-3', shift: { shift: 2, unit: 'weeks' }, powerDays: 4, relay: true });
    render(<App />);
    const readBack = await ask('IM-3 slipped 2 weeks and needs 4 days of power');
    expect(readBack).toHaveTextContent('IM-3 isn’t in our list yet, add its details.');
    expect(readBack).toHaveTextContent(formatClock(START + 14 * DAY_MS));
    // The AI's relay answer is not in the text, so it is not used.
    expect(readBack).toHaveTextContent("Relay: your text doesn't mention a relay");
    expect(within(readBack).queryByRole('button', { name: 'Apply' })).toBeNull();
    // Nothing opens or changes without a click.
    expect(screen.queryByRole('region', { name: 'Add your own mission' })).toBeNull();
    expect(clock()).toHaveTextContent(formatClock(START));

    fireEvent.click(within(readBack).getByRole('button', { name: 'Add its details' }));
    const form = missionForm();
    expect(form).toHaveTextContent('IM-3 isn’t in our list yet, add its details.');
    expect(within(form).getByRole('textbox', { name: 'Name' })).toHaveValue('IM-3');
    expect(field(form, 'Days of power needed')).toHaveValue(4);
    expect(field(form, 'Lowest Sun height for power')).toHaveValue(null);
    expect(field(form, 'Lowest Earth height for contact')).toHaveValue(null);
    expect(within(form).getByRole('checkbox', { name: /Has a relay/ })).not.toBeChecked();
    expect(within(form).getByRole('combobox', { name: 'Start from a preset' })).toHaveValue('');
    expect(within(form).getByLabelText('New date (UTC)')).toHaveValue('2026-11-29');
    const use = within(form).getByRole('button', { name: 'Use without saving' });
    expect(use).toBeDisabled();

    fireEvent.change(field(form, 'Lowest Sun height for power'), { target: { value: '3' } });
    fireEvent.change(field(form, 'Lowest Earth height for contact'), { target: { value: '2' } });
    fireEvent.click(use);
    expect(selectedMission()).toHaveTextContent('IM-3 · Custom');
    expect(clock()).toHaveTextContent(formatClock(START + 14 * DAY_MS));
  });

  it('never uses a number that is not in the text, and never shows it', async () => {
    answer({ powerDays: 7 });
    render(<App />);
    const readBack = await ask('We need more power now.');
    expect(readBack).toHaveTextContent(
      "Days of power needed: the number isn't in your text, so it was not used.",
    );
    expect(readBack).not.toHaveTextContent('7 days');
    expect(within(readBack).getByRole('button', { name: 'Apply' })).toBeDisabled();
    // Said plainly, with an example of each kind of text it reads.
    expect(readBack).toHaveTextContent(
      'Nothing changed: your text gives the same date and needs as now. To change something, try “Launch slipped 3 weeks”; to ask, try “Which site is best this month?”.',
    );
  });

  it('shows an out-of-range value with its error, keeps Apply off, and Edit shows it unchanged', async () => {
    answer({ minSunDeg: 25 });
    render(<App />);
    const readBack = await ask('The Sun must now be 25 degrees up.');
    expect(within(readBack).getByRole('list', { name: 'Problems' })).toHaveTextContent(
      'Lowest Sun height for power 25°: Outside the DEMO range, 0 to 20°.',
    );
    expect(within(readBack).getByRole('button', { name: 'Apply' })).toBeDisabled();
    fireEvent.click(within(readBack).getByRole('button', { name: 'Edit' }));
    const form = missionForm();
    expect(field(form, 'Lowest Sun height for power')).toHaveValue(25);
    expect(form).toHaveTextContent('Outside the DEMO range, 0 to 20°.');
    expect(within(form).getByRole('button', { name: 'Use without saving' })).toBeDisabled();
  });

  it('sends with Ctrl+Enter, and the read-back is a labelled group that takes the focus', async () => {
    const fetchMock = answer({ shift: { shift: 3, unit: 'weeks' } });
    render(<App />);
    const box = within(assistant()).getByRole('textbox', { name: 'Describe the change' });
    fireEvent.change(box, { target: { value: 'Launch slipped 3 weeks' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    const group = await screen.findByRole('group', { name: 'I read this as:' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The focus moves in an effect just after the group appears.
    await waitFor(() => expect(group).toHaveFocus());
  });

  it('clears the "Applied" sentence when another mission is picked', async () => {
    answer({ shift: { shift: 3, unit: 'weeks' } });
    render(<App />);
    const readBack = await ask('Launch slipped 3 weeks');
    fireEvent.click(within(readBack).getByRole('button', { name: 'Apply' }));
    await waitFor(() =>
      expect(within(assistant()).getByRole('status')).toHaveTextContent(/^Applied\./),
    );
    fireEvent.change(missionSelect(), { target: { value: 'demo-mission-c' } });
    expect(within(assistant()).getByRole('status')).not.toHaveTextContent('Applied');
  });

  it('clears the read-back when the text changes', async () => {
    answer({ shift: { shift: 3, unit: 'weeks' } });
    render(<App />);
    await ask('Launch slipped 3 weeks');
    fireEvent.change(within(assistant()).getByRole('textbox', { name: 'Describe the change' }), {
      target: { value: 'Launch slipped 4 weeks' },
    });
    expect(screen.queryByTestId('slip-read-back')).toBeNull();
  });

  it.each([
    [
      'no network',
      async () => {
        throw new TypeError('Failed to fetch');
      },
    ],
    [
      'a timeout',
      async () => {
        throw new DOMException('The operation was aborted.', 'AbortError');
      },
    ],
    [
      'no key or a server error',
      async () => new Response('{"error":"unavailable"}', { status: 503 }),
    ],
    ['broken JSON', async () => new Response('<!doctype html>', { status: 200 })],
    [
      'a malformed reading',
      async () =>
        new Response(JSON.stringify({ reading: { ...BLANK, powerDays: 'six' } }), { status: 200 }),
    ],
  ])('after %s, says so and the mission form still does the job', async (_label, reply) => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(reply));
    render(<App />);
    send('Launch slipped 3 weeks');
    expect(
      await within(assistant()).findByText(/The assistant isn’t available right now/),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('slip-read-back')).toBeNull();
    expect(clock()).toHaveTextContent(formatClock(START));

    fireEvent.click(within(assistant()).getByRole('button', { name: 'Open the mission form' }));
    const form = missionForm();
    fireEvent.change(within(form).getByRole('textbox', { name: 'Name' }), {
      target: { value: 'By hand' },
    });
    fireEvent.change(within(form).getByLabelText('New date (UTC)'), {
      target: { value: '2026-12-06' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Use without saving' }));
    expect(selectedMission()).toHaveTextContent('By hand · Custom');
    expect(clock()).toHaveTextContent('6 Dec 2026 · 00:00 UTC');
  });

  it('About says the free tier may use typed text to improve Google’s models', () => {
    render(<App />);
    fireEvent.click(railItem('About'));
    const notice = within(screen.getByRole('dialog')).getByTestId('ai-notice');
    expect(notice).toHaveTextContent('Gemini API on its free tier');
    expect(notice).toHaveTextContent('to improve its models');
  });
});

describe('Watch demo', () => {
  const demoBar = () => screen.getByRole('region', { name: 'Demo' });
  const press = (name: string) => fireEvent.click(within(demoBar()).getByRole('button', { name }));

  it('tells the slipped-launch story step by step, and Back goes back', () => {
    render(<App />);
    fireEvent.change(missionSelect(), { target: { value: 'demo-mission-c' } });
    watchDemo();
    expect(demoBar()).toHaveTextContent('Step 1 of 9');
    expect(demoBar()).toHaveTextContent('The launch slipped.');
    expect(within(demoBar()).getByRole('button', { name: 'Back' })).toBeDisabled();
    press('Next');
    // Step 2 picks Demo Mission A and shows its needs.
    expect(demoBar()).toHaveTextContent('Step 2 of 9');
    expect(missionSelect()).toHaveValue('demo-mission-a');
    press('Next');
    expect(demoBar()).toHaveTextContent('Step 3 of 9');
    press('Back');
    expect(demoBar()).toHaveTextContent('Step 2 of 9');
  });

  it('opens the views each step needs: the card, other dates, the pole, a spot, compare', async () => {
    await renderApp();
    const globe = screen.getByTestId('moon-globe');
    watchDemo();
    expect(globe).toHaveAttribute('data-whole-count', '1');
    for (let step = 1; step < 4; step++) press('Next');
    expect(within(details()).getByRole('img', { name: /over the horizon/ })).toBeInTheDocument();
    press('Next');
    press('Next');
    // Step 6: Other dates, opened.
    expect(section(details(), /^Other dates/)).toHaveAttribute('aria-expanded', 'true');
    press('Next');
    // Step 7: IM-2 Athena, the landing nearest the south pole, in the tilted south-pole view (not
    // a fly-to-site).
    expect(within(details()).getByRole('heading', { level: 3, name: 'IM-2 Athena' })).toBeVisible();
    expect(globe).toHaveAttribute('data-camera-view', 'south-pole');
    expect(globe).not.toHaveAttribute('data-fly-site', 'im2');
    press('Next');
    // Step 8: a spot away from every site, on the whole Moon (not left in the tilted view).
    expect(globe.dataset.picked).toBe('-45,-70');
    expect(globe).toHaveAttribute('data-camera-view', 'whole');
    expect(
      within(pointCard()).getByRole('heading', { level: 3, name: '45.0° S, 70.0° W' }),
    ).toBeVisible();
    press('Next');
    expect(demoBar()).toHaveTextContent('Step 9 of 9');
    expect(screen.getByRole('region', { name: 'Compare sites' })).toBeInTheDocument();
    press('Skip');
    expect(globe).toHaveAttribute('data-camera-view', 'restored:start');
    expect(globe.dataset.picked).toBe('none');
  });

  it('puts everything back when skipped or stopped with Escape, and writes nothing', () => {
    render(<App />);
    fireEvent.change(missionSelect(), { target: { value: 'demo-mission-c' } });
    const before = JSON.stringify({ ...window.localStorage });
    watchDemo();
    for (let step = 1; step < 9; step++) press('Next');
    press('Skip');
    expect(missionSelect()).toHaveValue('demo-mission-c');
    expect(screen.queryByRole('region', { name: 'Compare sites' })).not.toBeInTheDocument();
    watchDemo();
    press('Next');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Demo' })).not.toBeInTheDocument();
    expect(missionSelect()).toHaveValue('demo-mission-c');
    expect(JSON.stringify({ ...window.localStorage })).toBe(before);
  });

  it('ends on "Add your own mission" when done, and where it is when the app is clicked', () => {
    render(<App />);
    watchDemo();
    for (let step = 1; step < 9; step++) press('Next');
    press('Done');
    expect(screen.getByRole('region', { name: 'Add your own mission' })).toBeInTheDocument();
    watchDemo();
    press('Next');
    fireEvent.pointerDown(screen.getByRole('main', { name: 'Lunar map' }));
    expect(screen.queryByRole('region', { name: 'Demo' })).not.toBeInTheDocument();
  });

  it('is offered in About, at the end of the tour and on the rail', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'About' }));
    fireEvent.click(screen.getByRole('button', { name: 'Take the tour' }));
    const tour = screen.getByRole('dialog', { name: 'Tour' });
    for (let step = 1; step < TOUR_STEPS.length; step++) {
      fireEvent.click(within(tour).getByRole('button', { name: 'Next' }));
    }
    fireEvent.click(within(tour).getByRole('button', { name: 'Watch the short demo' }));
    expect(demoBar()).toHaveTextContent('Step 1 of 9');
    press('Skip');
    fireEvent.click(railItem('Demo'));
    expect(demoBar()).toHaveTextContent('Step 1 of 9');
    press('Skip');
  });
});

describe('Fixes from the whole-site review (2026-11-12)', () => {
  const demoBar = () => screen.getByRole('region', { name: 'Demo' });
  const press = (name: string) => fireEvent.click(within(demoBar()).getByRole('button', { name }));
  const exitButton = () => screen.queryByRole('button', { name: 'Exit presentation' });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps H and Escape working after the timeline slider was used', () => {
    render(<App />);
    const slider = within(timeBar()).getAllByRole('slider')[0];
    if (!slider) throw new Error('no slider');
    slider.focus();
    fireEvent.keyDown(slider, { key: 'h' });
    expect(exitButton()).toBeInTheDocument();
    fireEvent.keyDown(slider, { key: 'Escape' });
    expect(exitButton()).not.toBeInTheDocument();
  });

  it('Sites on the rail goes from a site card back to the list', () => {
    render(<App />);
    details();
    fireEvent.click(railItem('Sites'));
    expect(screen.getByRole('complementary', { name: 'Sites' })).toBeVisible();
  });

  it('calls the longest window "best", whatever order the list is in', () => {
    render(<App />);
    fireEvent.click(crumbs()[0] ?? document.body);
    fireEvent.click(within(plan()).getByRole('button', { name: 'Name' }));
    expect(timeBar()).toHaveTextContent(`Best site: ${topSite().site.name}`);
  });

  it('opens a shared link without the first-run tour, then clears it from the address bar', () => {
    window.localStorage.setItem(UI_PREFS_KEY, JSON.stringify({ keyHintSeen: true }));
    window.history.replaceState(null, '', `/#mission=demo-mission-b&t=${NOW}`);
    render(<App />);
    expect(window.location.hash).toBe('');
    expect(screen.queryByRole('dialog', { name: 'Tour' })).not.toBeInTheDocument();
    // A shared mission without a site opens on that mission's best site.
    const best = expectedSites('demo-mission-b')[0];
    if (!best) throw new Error('no site');
    expect(crumbs()[2]).toHaveTextContent(best.site.name);
  });

  it('restarting the demo from the rail keeps what Skip puts back', () => {
    render(<App />);
    fireEvent.change(missionSelect(), { target: { value: 'demo-mission-c' } });
    fireEvent.click(railItem('Demo'));
    press('Next');
    expect(missionSelect()).toHaveValue('demo-mission-a');
    // A real click: pointer down (which ends a running demo) then click (which starts one).
    fireEvent.pointerDown(railItem('Demo'));
    fireEvent.click(railItem('Demo'));
    expect(demoBar()).toHaveTextContent('Step 1 of 9');
    press('Skip');
    expect(missionSelect()).toHaveValue('demo-mission-c');
  });

  it('the demo shows the list best first, and puts the chosen order back', () => {
    render(<App />);
    fireEvent.click(within(plan()).getByRole('button', { name: 'Name' }));
    watchDemo();
    press('Next');
    press('Next');
    expect(
      within(screen.getByRole('complementary', { name: 'Sites' })).getByRole('button', {
        name: 'Longest window',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    press('Skip');
    expect(within(plan()).getByRole('button', { name: 'Name' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('Close works on the form the demo ends on, even if the form was open before', () => {
    render(<App />);
    fireEvent.click(within(missionView()).getByRole('button', { name: 'Add your own mission' }));
    watchDemo();
    for (let step = 1; step < 9; step++) press('Next');
    press('Done');
    fireEvent.click(screen.getByRole('button', { name: 'Close the mission form' }));
    expect(screen.queryByRole('region', { name: 'Add your own mission' })).not.toBeInTheDocument();
  });

  it("the tour's card step shows the best site when none is selected, and the tour puts the view back", () => {
    render(<App />);
    fireEvent.click(crumbs()[0] ?? document.body);
    fireEvent.click(screen.getByRole('button', { name: 'About' }));
    fireEvent.click(screen.getByRole('button', { name: 'Take the tour' }));
    const tour = screen.getByRole('dialog', { name: 'Tour' });
    for (let step = 1; step < 4; step++) {
      fireEvent.click(within(tour).getByRole('button', { name: 'Next' }));
    }
    expect(
      within(screen.getByRole('complementary', { name: 'Site details' })).getByRole('heading', {
        level: 3,
        name: topSite().site.name,
      }),
    ).toBeVisible();
    fireEvent.click(within(tour).getByRole('button', { name: 'Skip tour' }));
    expect(screen.getByRole('complementary', { name: 'Sites' })).toBeVisible();
  });

  it('keeps what is typed in the mission form when the panel only slides away', () => {
    render(<App />);
    fireEvent.click(within(missionView()).getByRole('button', { name: 'Add your own mission' }));
    fireEvent.change(
      within(screen.getByRole('region', { name: 'Add your own mission' })).getByRole('textbox', {
        name: 'Name',
      }),
      { target: { value: 'Kept' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Hide the panel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show the panel' }));
    expect(
      within(screen.getByRole('region', { name: 'Add your own mission' })).getByRole('textbox', {
        name: 'Name',
      }),
    ).toHaveValue('Kept');
  });

  it('Escape in the rename box cancels the rename only', () => {
    render(<App />);
    fireEvent.click(within(missionView()).getByRole('button', { name: 'Add your own mission' }));
    let form = screen.getByRole('region', { name: 'Add your own mission' });
    fireEvent.change(within(form).getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Mine' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Save as preset' }));
    fireEvent.click(within(missionView()).getByRole('button', { name: 'Add your own mission' }));
    form = screen.getByRole('region', { name: 'Add your own mission' });
    fireEvent.click(within(form).getByRole('button', { name: 'Rename Mine' }));
    fireEvent.keyDown(within(form).getByRole('textbox', { name: 'New name for Mine' }), {
      key: 'Escape',
    });
    expect(screen.getByRole('region', { name: 'Add your own mission' })).toBeInTheDocument();
    expect(within(form).queryByRole('textbox', { name: 'New name for Mine' })).toBeNull();
  });

  it('moves the focus to the new view when the old one is hidden', () => {
    render(<App />);
    const back = within(details()).getByRole('button', { name: 'All sites' });
    back.focus();
    fireEvent.click(back);
    expect(document.activeElement).toBe(within(plan()).getByRole('heading', { name: 'Sites' }));
  });

  it('copies the link on a laptop even where the browser offers a share sheet', async () => {
    const writeText = vi.fn<(url: string) => Promise<void>>(() => Promise.resolve());
    const share = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, share, clipboard: { writeText } });
    render(<App />);
    fireEvent.click(within(details()).getByRole('button', { name: 'Share' }));
    expect(await within(details()).findByText('Link copied.')).toBeInTheDocument();
    expect(share).not.toHaveBeenCalled();
  });

  it('presentation mode says "this month" and DEMO mission on its label', () => {
    render(<App />);
    fireEvent.keyDown(document.body, { key: 'h' });
    expect(screen.getByTestId('present-label')).toHaveTextContent(/this month\s*DEMO mission$/);
  });
});

describe('Lessons from past landings', () => {
  it('lists real landings, each with what happened, the lesson and its sources', () => {
    render(<App />);
    openRail('Lessons');
    const view = screen.getByRole('region', { name: 'Lessons from past landings' });
    expect(within(view).getAllByRole('heading', { level: 3 })).toHaveLength(LANDING_LESSONS.length);
    expect(view).toHaveTextContent('IM-2 (Athena)');
    expect(view).toHaveTextContent('Ended early');
    expect(view).toHaveTextContent('The lesson');
    const links = within(view).getAllByRole('link');
    expect(links.length).toBeGreaterThanOrEqual(LANDING_LESSONS.length);
    for (const link of links) {
      expect(link).toHaveAttribute('href', expect.stringMatching(/^https:\/\//));
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    // Journalism is labelled as such.
    expect(view).toHaveTextContent('PTI via Telangana Today (journalism)');
  });

  it('"See it in the tool" opens the landing site at its landing date (our engine: before the files)', () => {
    render(<App />);
    openRail('Lessons');
    const view = screen.getByRole('region', { name: 'Lessons from past landings' });
    // The four lessons that are also landing sites in the tool.
    expect(within(view).getAllByRole('button', { name: /^See it in the tool: / })).toHaveLength(4);
    fireEvent.click(
      within(view).getByRole('button', { name: 'See it in the tool: IM-2 (Athena)' }),
    );
    const card = screen.getByRole('complementary', { name: 'Site details' });
    expect(within(card).getByRole('heading', { level: 3, name: 'IM-2 Athena' })).toBeVisible();
    expect(clock()).toHaveTextContent('6 Mar 2025 · 00:00 UTC');
    expect(within(card).getByTestId('positions-label')).toHaveTextContent(ENGINE_LABEL);
  });
});

describe('Compare sites', () => {
  it('compares picked sites on power, comms and windows; removes one; closes with picks kept', () => {
    render(<App />);
    // Mission C: IM-2 Athena is the pick that is not suitable.
    pickMission('demo-mission-c');
    const suitable = expectedSites('demo-mission-c').filter((entry) => entry.rank !== null);
    const [a, b] = suitable;
    if (!a || !b) throw new Error('need two suitable sites');
    const toggle = (name: string) =>
      within(plan()).getByRole('button', { name: `Compare ${name}` });
    fireEvent.click(toggle(a.site.name));
    expect(plan()).toHaveTextContent('1 site picked. Pick one more to compare.');
    fireEvent.click(toggle(b.site.name));
    fireEvent.click(section(plan(), `Not suitable (${unsuitableCount('demo-mission-c')})`));
    fireEvent.click(toggle('IM-2 Athena'));
    fireEvent.click(within(plan()).getByRole('button', { name: 'Compare (3)' }));
    const panel = screen.getByRole('region', { name: 'Compare sites' });
    const table = within(panel).getByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual([`${a.site.name}Remove`, `${b.site.name}Remove`, 'IM-2 AthenaRemove']);
    // One row per check, each saying what it measures.
    const power = within(table).getByRole('row', { name: /^Power\s*the Sun only/ });
    expect(power).toHaveTextContent(/Longest sunlit stretch/);
    expect(power).toHaveTextContent(/OK.*OK.*Fails/);
    expect(within(table).getByRole('row', { name: /^Comms\s*the Earth only/ })).toHaveTextContent(
      /Earth at least 10° up/,
    );
    const usable = within(table).getByRole('row', {
      name: /^Usable window\s*the Sun and Earth both/,
    });
    expect(usable).toHaveTextContent(/in this month \(needs 2\)/);
    // "Best" on the usable window is the Sites list's best (when it is among the picks).
    if (a.site.id === topSite('demo-mission-c').site.id) {
      expect(usable).toHaveTextContent('Best');
    }
    expect(within(table).getByRole('row', { name: /^Best window/ })).toHaveTextContent('days');
    // The range's hours, one row each.
    const h = (value: number) => `${value.toLocaleString('en-US')} h`;
    expect(within(table).getByRole('row', { name: /^Hours of Sun/ })).toHaveTextContent(
      h(a.assessment.sky.sunHours),
    );
    expect(within(table).getByRole('row', { name: /^Hours of Earth/ })).toHaveTextContent(
      h(a.assessment.sky.earthHours),
    );
    expect(within(table).getByRole('row', { name: /^Hours of both/ })).toHaveTextContent(
      h(b.assessment.sky.bothHours),
    );
    expect(within(table).getByRole('row', { name: /^Now/ })).toHaveTextContent(/Sun .*Earth/);
    expect(within(panel).getByTestId('compare-verdict')).toHaveTextContent(
      'IM-2 Athena is not suitable',
    );
    fireEvent.click(within(panel).getByRole('button', { name: `Remove ${b.site.name}` }));
    expect(within(table).getAllByRole('columnheader')).toHaveLength(2);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Compare sites' })).not.toBeInTheDocument();
    expect(toggle('IM-2 Athena')).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Tour', () => {
  it('shows six steps to a first-time visitor, skippable with Escape, then not again', () => {
    window.localStorage.removeItem(UI_PREFS_KEY);
    render(<App />);
    const tour = screen.getByRole('dialog', { name: 'Tour' });
    expect(tour).toHaveTextContent('1 of 6');
    expect(within(tour).getByRole('button', { name: 'Next' })).toHaveFocus();
    fireEvent.click(within(tour).getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('region', { name: 'Mission' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Tour' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Tour' })).not.toBeInTheDocument();
    cleanup();
    render(<App />);
    expect(screen.queryByRole('dialog', { name: 'Tour' })).not.toBeInTheDocument();
  });

  it('walks the rail, mission, sites, horizon, status line and timeline', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'About' }));
    fireEvent.click(screen.getByRole('button', { name: 'Take the tour' }));
    const tour = screen.getByRole('dialog', { name: 'Tour' });
    const texts: string[] = [];
    for (let step = 1; step <= 6; step++) {
      texts.push(tour.textContent ?? '');
      if (step === 4) expect(details()).toBeInTheDocument();
      if (step < 6) fireEvent.click(within(tour).getByRole('button', { name: 'Next' }));
    }
    expect(texts[1]).toMatch(/Pick a mission/);
    expect(texts[3]).toMatch(/The horizon view/);
    expect(texts[4]).toMatch(/sunset and Earthset/);
    fireEvent.click(within(tour).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog', { name: 'Tour' })).not.toBeInTheDocument();
  });
});

describe('Anywhere on the Moon', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
  });

  it('checks any spot for the mission: the card, the pin, the timeline and the breadcrumb', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'simulate ground click' }));
    const card = pointCard();
    const expected = checkPoint(
      { lat: 20.25, lon: 40.5 },
      mission(),
      hourlySky(sampledSpan(RANGE)),
      RANGE,
    );
    expect(within(card).getByRole('heading', { level: 3, name: '20.3° N, 40.5° E' })).toBeVisible();
    expect(card).toHaveTextContent(
      expected.assessment.suitable ? 'Power and comms OK for Demo Mission A' : 'Not suitable',
    );
    const nearest = expected.nearest;
    if (!nearest) throw new Error('no nearest site');
    expect(card).toHaveTextContent(
      `Nearest landing site: ${nearest.site.name}, ${nearest.distanceKm.toLocaleString('en-US')} km away`,
    );
    expect(card).toHaveTextContent('Flat horizon: no terrain data for this point');
    expect(within(card).getAllByText(COMMS_NOTE)).toHaveLength(1);
    expect(within(card).getByRole('img', { name: /over the horizon/ })).toBeInTheDocument();
    expect(screen.getByTestId('moon-globe').dataset.picked).toBe('20.25,40.5');
    expect(timeBar()).toHaveTextContent('Landing windows · Your point 20.3° N, 40.5° E');
    expect(crumbs()[2]).toHaveTextContent('20.3° N, 40.5° E');
    expect(crumbs()[2]).toHaveAttribute('aria-current', 'location');
    fireEvent.click(within(card).getByRole('button', { name: 'All sites' }));
    expect(screen.getByTestId('moon-globe').dataset.picked).toBe('20.25,40.5');
    fireEvent.click(crumbs()[2] as HTMLElement);
    expect(pointCard()).toBeInTheDocument();
  });

  it('is replaced by a site chosen afterwards; Moon clears it', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'simulate ground click' }));
    fireEvent.click(await mapMarker('IM-1 Odysseus'));
    expect(screen.getByTestId('moon-globe').dataset.picked).toBe('none');
    expect(within(details()).getByRole('heading', { name: 'IM-1 Odysseus' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'simulate ground click' }));
    fireEvent.click(crumbs()[0] as HTMLElement);
    expect(screen.getByTestId('moon-globe').dataset.picked).toBe('none');
    expect(crumbs()).toHaveLength(2);
  });

  it('shares the spot in the link, and a shared link opens on it', async () => {
    const writeText = vi.fn<(url: string) => Promise<void>>(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } });
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'simulate ground click' }));
    fireEvent.click(within(pointCard()).getByRole('button', { name: 'Share' }));
    await screen.findByText('Link copied.');
    expect(String(writeText.mock.calls[0]?.[0])).toContain(
      '#mission=demo-mission-a&at=20.25%2C40.50&t=',
    );
    vi.unstubAllGlobals();
    cleanup();
    window.history.replaceState(
      null,
      '',
      '/#mission=demo-mission-a&at=-85.5,31&t=2026-12-01T10:00:00Z',
    );
    render(<App />);
    expect(
      within(pointCard()).getByRole('heading', { level: 3, name: '85.5° S, 31.0° E' }),
    ).toBeVisible();
    expect(screen.getByTestId('moon-globe').dataset.picked).toBe('-85.5,31');
  });
});

describe('Map', () => {
  it('sends no fly-to for the automatic #1, and one for every choice after', async () => {
    await renderApp();
    const globe = screen.getByTestId('moon-globe');
    expect(globe.dataset.flySeq).toBe('0');
    fireEvent.click(rankedRows()[0] ?? plan());
    expect(globe.dataset.flySite).toBe(topSite().site.id);
    expect(globe.dataset.flySeq).toBe('1');
    fireEvent.click(await mapMarker('IM-2 Athena'));
    expect(globe.dataset.flySite).toBe('im2');
    expect(globe.dataset.flySeq).toBe('2');
  });

  it('numbers the suitable beacons in list order; unsuitable ones carry none', async () => {
    await renderApp();
    const markers = screen.getAllByTestId('map-marker');
    expect(markers.map((marker) => marker.dataset.rank)).toEqual(
      expectedSites().map((entry) => String(entry.rank ?? 'none')),
    );
  });

  it('offers zoom, whole Moon and a grid switch', async () => {
    await renderApp();
    const controls = screen.getByRole('group', { name: 'Map' });
    for (const name of ['Zoom in', 'Zoom out', 'Whole Moon']) {
      expect(within(controls).getByRole('button', { name })).toBeInTheDocument();
    }
    const grid = within(controls).getByRole('button', { name: 'Latitude/longitude grid' });
    fireEvent.click(grid);
    expect(grid).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByTestId('graticule-line').length).toBeGreaterThan(0);
  });

  it('offers the south-pole view next to the whole Moon; the default view stays as it was', async () => {
    await renderApp();
    const globe = screen.getByTestId('moon-globe');
    expect(globe).toHaveAttribute('data-camera-view', 'start');
    const controls = screen.getByRole('group', { name: 'Map' });
    fireEvent.click(within(controls).getByRole('button', { name: 'South pole' }));
    expect(globe).toHaveAttribute('data-camera-view', 'south-pole');
  });

  it('has a "Map layers" button in place of the old Elevation and Slope buttons', async () => {
    await renderApp();
    const controls = screen.getByRole('group', { name: 'Map' });
    for (const name of ['Elevation', 'Slope']) {
      expect(within(controls).queryByRole('button', { name })).toBeNull();
    }
    for (const button of within(controls).getAllByRole('button')) {
      expect(button).not.toHaveAttribute('aria-disabled');
    }
    expect(within(controls).getByRole('button', { name: 'Map layers' })).toBeInTheDocument();
    // The best site now is outside 80° S: its card says the layers don't reach it.
    if (topSite().site.lat > -80) {
      expect(within(details()).getByTestId('elevation-line')).toHaveTextContent(
        'No data here: this tool covers 80° S to the pole',
      );
    }
  });
});

describe('Map layers: elevation and slope', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens the layers panel; switching slope on draws it with its legend and readings', async () => {
    // The value tiles, read from disk as the browser would fetch them.
    const root = decodeURIComponent(new URL(import.meta.url).pathname)
      .replace(/^\/([A-Za-z]:)/, '$1')
      .replace(/tests\/unit\/[^/]*$/, '');
    const { existsSync, readFileSync } = await import('node:fs');
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input) => {
        const path = String(input).replace(/^.*?data\/layers\//, `${root}public/data/layers/`);
        if (!existsSync(path)) return new Response('missing', { status: 404 });
        return new Response(readFileSync(path).slice().buffer);
      }),
    );
    await renderApp();
    const globe = screen.getByTestId('moon-globe');
    expect(globe).toHaveAttribute('data-layers', 'none');
    fireEvent.click(screen.getByRole('button', { name: 'Map layers' }));
    const panel = screen.getByRole('region', { name: 'Map layers' });
    fireEvent.click(within(panel).getByRole('checkbox', { name: 'Slope' }));
    expect(globe).toHaveAttribute('data-layers', 'slope:0.8');
    expect(within(panel).getByRole('figure', { name: 'Slope legend, °' })).toBeInTheDocument();
    fireEvent.change(within(panel).getByRole('slider', { name: 'Slope opacity' }), {
      target: { value: '50' },
    });
    expect(globe).toHaveAttribute('data-layers', 'slope:0.5');
    // Elevation too: drawn under slope (first in the list), with its legend in metres. Switched on
    // last, and with values, it takes the readings.
    fireEvent.click(within(panel).getByRole('checkbox', { name: 'Elevation' }));
    expect(globe).toHaveAttribute('data-layers', 'elevation:0.8 slope:0.5');
    expect(within(panel).getByRole('figure', { name: 'Elevation legend, m' })).toBeInTheDocument();
    expect(panel).not.toHaveTextContent('Legend unavailable');
    expect(within(panel).getByRole('radio', { name: 'Elevation' })).toBeChecked();
    // The pointer over IM-1: the values from the value tiles, at 40 m.
    fireEvent.click(screen.getByRole('button', { name: 'simulate hover over IM-1' }));
    await waitFor(() =>
      expect(within(panel).getByTestId('layer-readout')).toHaveTextContent(
        'Elevation 2592 m · 40 mReal data',
      ),
    );
    fireEvent.click(within(panel).getByRole('radio', { name: 'Slope' }));
    await waitFor(() =>
      expect(within(panel).getByTestId('layer-readout')).toHaveTextContent(
        'Slope 12.28° · 40 mReal data',
      ),
    );
    // A tap (the picked point) replaces the hover point: 20° N is outside the layers.
    fireEvent.click(screen.getByRole('button', { name: 'simulate ground click' }));
    await waitFor(() =>
      expect(within(panel).getByTestId('layer-readout')).toHaveTextContent(
        'No data here: this tool covers 80° S to the pole',
      ),
    );
    fireEvent.click(within(panel).getByRole('button', { name: 'Close map layers' }));
    expect(screen.queryByRole('region', { name: 'Map layers' })).toBeNull();
    // Closing the panel keeps the layers on.
    expect(globe).toHaveAttribute('data-layers', 'elevation:0.8 slope:0.5');
  });
});

describe('Sun and Earth positions, and JPL Horizons', () => {
  it('says where the positions came from, and links to the same query in JPL Horizons', () => {
    render(<App />);
    const top = topSite();
    const card = details();
    // These tests run without the Horizons files, so our engine.
    expect(within(card).getByTestId('positions-label')).toHaveTextContent(ENGINE_LABEL);
    for (const body of ['sun', 'earth'] as const) {
      const link = within(card).getByRole('link', {
        name: `View the ${body === 'sun' ? 'Sun' : 'Earth'} in JPL Horizons (opens in a new tab)`,
      });
      expect(link).toHaveAttribute('href', viewInHorizonsUrl(body, top.site, RANGE));
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('uses our engine for a picked point, with no Horizons links', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'simulate ground click' }));
    const card = pointCard();
    expect(within(card).getByTestId('positions-label')).toHaveTextContent(ENGINE_LABEL);
    expect(within(card).queryByRole('link', { name: /JPL Horizons/ })).toBeNull();
  });

  it('shows the "Checked against JPL Horizons" table in About → Data and credits', () => {
    render(<App />);
    fireEvent.click(railItem('About'));
    fireEvent.click(screen.getByRole('tab', { name: 'Data and credits' }));
    expect(
      within(screen.getByRole('dialog')).getByRole('region', {
        name: 'Checked against JPL Horizons',
      }),
    ).toBeInTheDocument();
  });
});

describe('Dates to check', () => {
  const DEC: TimeRange = { start: Date.UTC(2026, 11, 12), end: Date.UTC(2026, 11, 26) };

  function dates() {
    const view = within(missionView()).getByRole('region', { name: 'Dates to check' });
    return {
      view,
      start: within(view).getByLabelText('Start (UTC)'),
      stop: within(view).getByLabelText('Stop (UTC)'),
    };
  }

  it('checks the picked dates everywhere, and moves the time bar to their start', () => {
    render(<App />);
    expect(dates().view).toHaveTextContent('Checking the time bar’s 29.5 days.');
    fireEvent.change(dates().start, { target: { value: '2026-12-12' } });
    expect(dates().view).toHaveTextContent('Pick both dates.');
    fireEvent.change(dates().stop, { target: { value: '2026-12-25' } });
    expect(dates().view).toHaveTextContent('Checking 12 Dec 2026 to 25 Dec 2026 (UTC)');
    expect(clock()).toHaveTextContent('12 Dec 2026 · 00:00 UTC');

    const expected = expectedSites('demo-mission-a', 'window', DEC);
    const suitable = expected.filter((entry) => entry.rank !== null);
    expect(plan()).toHaveTextContent('Checking 12 Dec 2026 to 25 Dec 2026 (UTC)');
    expect(rankedRows()).toHaveLength(suitable.length);
    const first = suitable[0];
    if (!first) throw new Error('no suitable site in those dates');
    expect(rankedRows()[0]).toHaveTextContent(first.site.name);
    expect(rankedRows()[0]).toHaveTextContent(hoursText(first));
    // The horizon view, the links and the checks follow the same dates.
    fireEvent.click(rankedRows()[0] ?? plan());
    expect(
      within(details()).getByRole('link', { name: /View the Sun in JPL Horizons/ }),
    ).toHaveAttribute('href', viewInHorizonsUrl('sun', first.site, DEC));
  });

  it('never calls picked dates "this month"', () => {
    render(<App />);
    fireEvent.change(dates().start, { target: { value: '2026-12-12' } });
    fireEvent.change(dates().stop, { target: { value: '2026-12-25' } });
    expect(rankedRows()[0]).toHaveAccessibleName(/usable in these dates/);
    const card = details();
    expect(within(card).getByRole('group', { name: 'These dates' })).toHaveTextContent(
      /Sun up\s*\d+% of these dates/,
    );
    expect(card).not.toHaveTextContent(/this month|of the month/);
  });

  it('clears picked dates for the guided demo, and puts them back after it', () => {
    render(<App />);
    fireEvent.change(dates().start, { target: { value: '2026-12-12' } });
    fireEvent.change(dates().stop, { target: { value: '2026-12-25' } });
    watchDemo();
    expect(plan()).not.toHaveTextContent('Checking 12 Dec 2026');
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Demo' })).getByRole('button', { name: 'Skip' }),
    );
    expect(dates().start).toHaveValue('2026-12-12');
    expect(plan()).toHaveTextContent('Checking 12 Dec 2026 to 25 Dec 2026 (UTC)');
  });

  it('shares the picked dates in the link, and a link with dates opens on them', async () => {
    const writeText = vi.fn<(url: string) => Promise<void>>(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } });
    render(<App />);
    fireEvent.change(dates().start, { target: { value: '2026-12-12' } });
    fireEvent.change(dates().stop, { target: { value: '2026-12-25' } });
    fireEvent.click(within(details()).getByRole('button', { name: 'Share' }));
    await within(details()).findByText('Link copied.');
    const url = String(writeText.mock.calls[0]?.[0]);
    expect(url).toContain('&from=2026-12-12&to=2026-12-25&');
    vi.unstubAllGlobals();
    cleanup();
    window.history.replaceState(null, '', url.slice(url.indexOf('#') - 1));
    render(<App />);
    expect(plan()).toHaveTextContent('Checking 12 Dec 2026 to 25 Dec 2026 (UTC)');
    window.history.replaceState(null, '', '/');
  });

  it('explains impossible dates inline and keeps checking what it had', () => {
    render(<App />);
    fireEvent.change(dates().start, { target: { value: '2026-12-25' } });
    fireEvent.change(dates().stop, { target: { value: '2026-12-12' } });
    expect(within(dates().view).getByRole('alert')).toHaveTextContent(
      'The stop date is before the start date.',
    );
    expect(dates().start).toHaveAttribute('aria-invalid', 'true');
    expect(plan()).not.toHaveTextContent('Checking 25 Dec');
    fireEvent.change(dates().start, { target: { value: '2026-01-01' } });
    fireEvent.change(dates().stop, { target: { value: '2027-01-01' } });
    expect(within(dates().view).getByRole('alert')).toHaveTextContent('Pick at most 12 months.');
  });

  it('delays both dates by a week or a month, and goes back to the time bar’s 29.5 days', () => {
    render(<App />);
    expect(within(dates().view).getByRole('button', { name: 'Delay 1 week' })).toBeDisabled();
    fireEvent.change(dates().start, { target: { value: '2026-12-12' } });
    fireEvent.change(dates().stop, { target: { value: '2026-12-25' } });
    fireEvent.click(within(dates().view).getByRole('button', { name: 'Delay 1 week' }));
    expect(dates().start).toHaveValue('2026-12-19');
    expect(dates().stop).toHaveValue('2027-01-01');
    expect(clock()).toHaveTextContent('19 Dec 2026 · 00:00 UTC');
    fireEvent.click(within(dates().view).getByRole('button', { name: 'Delay 1 month' }));
    expect(dates().view).toHaveTextContent('Checking 19 Jan 2027 to 1 Feb 2027 (UTC)');
    fireEvent.click(
      within(dates().view).getByRole('button', { name: 'Use the time bar’s 29.5 days' }),
    );
    expect(dates().start).toHaveValue('');
    expect(plan()).not.toHaveTextContent('Checking 19 Jan');
  });

  it('takes dates from the "Launch slipped?" assistant: shown first, used on Apply', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(
        async () =>
          new Response(
            JSON.stringify({
              reading: {
                missionName: null,
                shift: null,
                date: null,
                range: {
                  from: { day: 12, month: 'December', year: null },
                  to: { day: 25, month: 'December', year: null },
                },
                powerDays: null,
                minSunDeg: null,
                minEarthDeg: null,
                relay: null,
                question: null,
                unclear: [],
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );
    render(<App />);
    const box = within(missionView()).getByRole('region', { name: 'Launch slipped?' });
    fireEvent.change(within(box).getByRole('textbox', { name: 'Describe the change' }), {
      target: { value: 'Plan for between 12 Dec and 25 Dec' },
    });
    fireEvent.click(within(box).getByRole('button', { name: 'Read it' }));
    const readBack = await screen.findByTestId('slip-read-back');
    expect(readBack).toHaveTextContent('Dates checked12 Dec 2026 to 25 Dec 2026 (UTC)');
    expect(readBack).toHaveTextContent('no year in your text, so the next December was used');
    // Nothing changes before Apply.
    expect(dates().start).toHaveValue('');
    fireEvent.click(within(readBack).getByRole('button', { name: 'Apply' }));
    expect(dates().start).toHaveValue('2026-12-12');
    expect(dates().stop).toHaveValue('2026-12-25');
    expect(clock()).toHaveTextContent('12 Dec 2026 · 00:00 UTC');
    vi.unstubAllGlobals();
  });
});

describe('Over the year, distances and night survival', () => {
  it('shows light, water and Earth over the year at the top of Site details, each tagged', () => {
    render(<App />);
    const top = topSite();
    const year = within(details()).getByRole('group', { name: 'Over the year' });
    const polar = top.site.lat <= -80;
    expect(year).toHaveTextContent(
      polar
        ? '% of the year in sunlightUnavailable: the PGDA lighting file isn’t loaded yetUnavailable'
        : '% of the year in sunlightNot applicable: outside south-polar dataUnavailable',
    );
    expect(year).toHaveTextContent('Nearest permanent shadow (where ice may be)');
    // The Horizons files are not loaded in these tests: Earth is unavailable until they are.
    expect(year).toHaveTextContent(
      'Earth above the horizon in 2027Unavailable until the JPL Horizons positions loadUnavailable',
    );
  });

  it('gives the distance from the south pole in Site details', () => {
    render(<App />);
    const top = topSite();
    expect(within(details()).getByRole('group', { name: 'The landing' })).toHaveTextContent(
      `From the south pole${formatKm(haversineKm(top.site, SOUTH_POLE))}Calculated`,
    );
  });

  it('has a night-survival block for a landing site, none for a picked point', async () => {
    await renderApp();
    const card = details();
    fireEvent.click(within(card).getByRole('button', { name: 'Night survival' }));
    const block = within(card).getByTestId('night-survival');
    expect(within(block).getByTestId('night-verdict')).toHaveTextContent(
      /^(Survives|Doesn’t survive|Can't judge)/,
    );
    expect(block).toHaveTextContent(/Battery needed here: /);
    expect(block.textContent).not.toContain('Heater');
    fireEvent.click(screen.getByRole('button', { name: 'simulate ground click' }));
    expect(within(pointCard()).queryByRole('button', { name: 'Night survival' })).toBeNull();
  });

  it('uses the Power check’s slider watts for "Battery needed here"', () => {
    render(<App />);
    const card = details();
    fireEvent.click(section(card, /^Power check/));
    fireEvent.click(section(card, /^Power details/));
    fireEvent.change(within(card).getByRole('slider', { name: NIGHT_LOAD }), {
      target: { value: '55' },
    });
    fireEvent.click(within(card).getByRole('button', { name: 'Night survival' }));
    expect(within(card).getByTestId('night-survival')).toHaveTextContent(
      /for your 55 W night load \(set in Power details\)/,
    );
  });

  it('compares the distance from the pole, the year values, and the distances between the sites', () => {
    render(<App />);
    const [a, b] = expectedSites().filter((entry) => entry.rank !== null);
    if (!a || !b) throw new Error('need two suitable sites');
    fireEvent.click(within(plan()).getByRole('button', { name: `Compare ${a.site.name}` }));
    fireEvent.click(within(plan()).getByRole('button', { name: `Compare ${b.site.name}` }));
    fireEvent.click(within(plan()).getByRole('button', { name: 'Compare (2)' }));
    const panel = screen.getByRole('region', { name: 'Compare sites' });
    const table = within(panel).getByRole('table');
    expect(within(table).getByRole('row', { name: /^From the south pole/ })).toHaveTextContent(
      formatKm(haversineKm(a.site, SOUTH_POLE)),
    );
    for (const name of [
      /^% of the year in sunlight/,
      /^Nearest permanent shadow \(where ice may be\)/,
      /^Earth above the horizon in 2027/,
    ]) {
      expect(within(table).getByRole('row', { name })).toHaveTextContent(/Unavailable/);
    }
    expect(
      within(panel).getByRole('list', { name: 'Distances between the compared sites' }),
    ).toHaveTextContent(
      `${a.site.name} to ${b.site.name}: ${formatKm(haversineKm(a.site, b.site))}`,
    );
  });
});

describe('Compare Timeline', () => {
  it('moves the dates checked from the Timeline bracket, and the Sites list follows', () => {
    render(<App />);
    const [a, b] = expectedSites().filter((entry) => entry.rank !== null);
    if (!a || !b) throw new Error('need two suitable sites');
    fireEvent.click(within(plan()).getByRole('button', { name: `Compare ${a.site.name}` }));
    fireEvent.click(within(plan()).getByRole('button', { name: `Compare ${b.site.name}` }));
    fireEvent.click(within(plan()).getByRole('button', { name: 'Compare (2)' }));
    const panel = screen.getByRole('region', { name: 'Compare sites' });
    fireEvent.click(within(panel).getByRole('tab', { name: 'Timeline' }));
    const bracket = within(panel).getByRole('slider', { name: 'Dates checked' });
    // The time bar's real 29.5 days, until the bracket moves: then 30 whole days.
    expect(bracket.getAttribute('aria-valuetext')).toMatch(
      /^the time bar’s 29\.5 days \(31 Oct 18:00 to 30 Nov 06:00 UTC\); /,
    );
    fireEvent.keyDown(bracket, { key: 'ArrowRight' });
    expect(bracket.getAttribute('aria-valuetext')).toMatch(/^1 Nov 2026 to 30 Nov 2026 \(UTC\); /);
    expect(clock()).toHaveTextContent('1 Nov 2026 · 00:00 UTC');
    const rows = within(panel).getByRole('list', { name: 'Sites on the timeline' });
    const moved = expectedSites('demo-mission-a', 'window', {
      start: Date.UTC(2026, 10, 1),
      end: Date.UTC(2026, 11, 1),
    });
    const first = moved.find((entry) => entry.site.id === a.site.id);
    if (!first) throw new Error('site missing');
    expect(rows).toHaveTextContent(hoursText(first));
    fireEvent.click(railItem('Sites'));
    expect(plan()).toHaveTextContent('Checking 1 Nov 2026 to 30 Nov 2026 (UTC)');
  });
});
