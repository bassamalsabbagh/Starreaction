import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { App } from '../../src/app/App';
import { SITES } from '../../src/services/sites';

vi.mock('../../src/features/lunar-map/MoonGlobe', () => import('../mocks/MoonGlobe'));
// Load the map's stand-in once up front (see tests/unit/AppLoading.test.tsx).
beforeAll(async () => {
  await import('../mocks/MoonGlobe');
});
// A smooth Moon, whatever terrain data is loaded; the terrain rule has its own tests.
vi.mock('../../src/data/terrainPatches', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/data/terrainPatches')>()),
  terrainProfileFor: () => null,
}));
// Our engine for the Sun and Earth: the JPL Horizons files are not loaded here (their use has its
// own tests). One empty map, so the app sees the same one every render.
vi.mock('../../src/features/lunar-map/useHorizonsSeries', () => {
  const none = { series: new Map(), settled: false };
  return { useHorizonsSeries: () => none };
});

const NOW = '2026-11-15T02:00:00Z';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const GLOBE_WAIT_MS = 15_000;

async function renderApp() {
  render(<App />);
  await screen.findByTestId('moon-globe', {}, { timeout: GLOBE_WAIT_MS });
}

function railItem(name: string) {
  return within(screen.getByRole('navigation', { name: 'Menu' })).getByRole('button', {
    name: new RegExp(`^${name}(, \\d+ picked)?$`),
  });
}

function stepper() {
  return screen.getByRole('navigation', { name: 'Steps' });
}

function currentStep() {
  return within(stepper())
    .getAllByRole('button')
    .find((button) => button.getAttribute('aria-current') === 'step');
}

/** A "Past landings" button in the Location step (the map has a pin of the same name). */
function pastLanding(name: string) {
  return within(screen.getByRole('region', { name: 'Pick a past landing' })).getByRole('button', {
    name,
  });
}

function next() {
  return screen.getByRole('button', { name: 'Next' });
}

function back() {
  return screen.getByRole('button', { name: 'Back' });
}

/** IM-2 Athena, a past landing near the pole. */
const IM2 = SITES.find((site) => site.id === 'im2');

/** Location (IM-2), Mission (a name), Dates (the defaults), Results. */
function walkToResults(name = 'Test rover') {
  if (!IM2) throw new Error('IM-2 missing');
  fireEvent.click(pastLanding(IM2.name));
  fireEvent.click(next());
  fireEvent.change(screen.getByRole('textbox', { name: 'Name (optional)' }), {
    target: { value: name },
  });
  fireEvent.click(next());
  fireEvent.click(next());
}

describe('App layout', () => {
  it('shows no demo mission anywhere', async () => {
    await renderApp();
    expect(document.body).not.toHaveTextContent(/Demo Mission|DEMO/);
  });

  it('has Plan, Compare and About on the rail, and no Lessons, Sites or Demo', async () => {
    await renderApp();
    const menu = screen.getByRole('navigation', { name: 'Menu' });
    for (const name of ['Plan', 'Compare', 'About']) {
      expect(within(menu).getByRole('button', { name })).toBeInTheDocument();
    }
    for (const name of ['Lessons', 'Sites', 'Demo', 'Mission']) {
      expect(within(menu).queryByRole('button', { name })).toBeNull();
    }
  });

  it('enters presentation mode with H and leaves it with Escape', async () => {
    await renderApp();
    fireEvent.keyDown(document, { key: 'h' });
    expect(screen.getByRole('button', { name: /Exit/ })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: /Exit/ })).toBeNull();
  });
});

describe('The four-step plan', () => {
  it('walks Location, Mission, Dates and Results; Back keeps every value', async () => {
    await renderApp();
    if (!IM2) throw new Error('IM-2 missing');
    // Step 1: Next waits for a location.
    expect(currentStep()).toHaveTextContent('Location');
    expect(next()).toBeDisabled();
    expect(back()).toBeDisabled();
    // One hint line only; no "choose a location" line, no other hints.
    // (Compare, hidden, uses the same line.)
    expect(
      screen.getAllByText('South and west are negative, e.g. -84.79, 29.20').length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/Choose a location to go on|No location chosen yet/)).toBeNull();
    expect(screen.queryByText(/South is negative, east is positive/)).toBeNull();
    // The terrain-horizon note is on the About page, not in this step.
    expect(screen.queryByText(/Terrain horizon/)).toBeNull();
    fireEvent.click(pastLanding(IM2.name));
    // The chip fills the box with the site's coordinates (two decimals) and stays highlighted.
    expect(screen.getByRole('textbox', { name: 'Go to coordinates' })).toHaveValue('-84.79, 29.20');
    expect(pastLanding(IM2.name)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText(/Chosen:/)).toBeNull();
    fireEvent.click(next());

    // Step 2: the heading takes the focus; no banner; the name never blocks Next (empty is "My lander").
    const missionHeading = screen.getByRole('heading', {
      level: 2,
      name: 'What does your lander need?',
    });
    expect(missionHeading).toHaveFocus();
    expect(currentStep()).toHaveTextContent('Lander');
    expect(screen.queryByText(/Starting values/)).toBeNull();
    expect(screen.queryByText(/Up to 30 characters/)).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Name (optional)' })).toHaveAttribute(
      'placeholder',
      'My lander',
    );
    expect(next()).toBeEnabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Name (optional)' }), {
      target: { value: 'Test rover' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Days of sunlight needed in a row' }), {
      target: { value: '2' },
    });
    fireEvent.click(next());

    // Step 3: today and the next 14 days.
    expect(currentStep()).toHaveTextContent('Dates');
    expect(screen.getByLabelText('Start (UTC)')).toHaveValue('2026-11-15');
    expect(screen.getByLabelText('Stop (UTC)')).toHaveValue('2026-11-29');
    // The time bar belongs to the Results step only.
    expect(screen.queryByRole('button', { name: 'Close the time bar' })).toBeNull();
    fireEvent.click(next());

    // Step 4: the main card first.
    expect(currentStep()).toHaveTextContent('Results');
    const results = screen.getByRole('article', { name: new RegExp(IM2.name) });
    // Three tiles, in days, each with pass or fail; no hours, no separate check rows.
    const tiles = within(results).getByRole('list', { name: 'Checks' });
    for (const label of ['Sun up', 'Earth in view', 'Sun + Earth together']) {
      expect(within(tiles).getByText(label)).toBeInTheDocument();
    }
    expect(tiles).toHaveTextContent(/\d+\.\d days/);
    expect(results).not.toHaveTextContent(/ h\b|Best window|needs met|Share|Usable window/);
    expect(within(results).getByText('Other recommended dates')).toBeInTheDocument();
    // The Horizons files are not loaded in these tests: our engine.
    expect(
      within(results).getByText('Data: our engine · flat horizon (hills not included)'),
    ).toBeInTheDocument();
    expect(within(results).getByRole('button', { name: 'More details ›' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('button', { name: '+7 days' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();

    // Back, once: the dates and then the mission are as entered.
    fireEvent.click(back());
    expect(screen.getByLabelText('Stop (UTC)')).toHaveValue('2026-11-29');
    fireEvent.click(back());
    expect(screen.getByRole('textbox', { name: 'Name (optional)' })).toHaveValue('Test rover');
    expect(
      screen.getByRole('spinbutton', { name: 'Days of sunlight needed in a row' }),
    ).toHaveValue(2);
    // Completed steps can be opened from the stepper.
    fireEvent.click(within(stepper()).getByRole('button', { name: /Results/ }));
    expect(currentStep()).toHaveTextContent('Results');
  });

  it('blocks Next on impossible mission needs and says why', async () => {
    await renderApp();
    if (!IM2) throw new Error('IM-2 missing');
    fireEvent.click(pastLanding(IM2.name));
    fireEvent.click(next());
    fireEvent.change(screen.getByRole('textbox', { name: 'Name (optional)' }), {
      target: { value: 'Test rover' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'How high must the Sun be?' }), {
      target: { value: '99' },
    });
    expect(next()).toBeDisabled();
    expect(screen.getByText(/Put the needs inside the ranges/)).toBeVisible();
  });

  it('shows the time bar on Results, named after the location, with no Live or mission text', async () => {
    await renderApp();
    walkToResults();
    const bar = screen.getByRole('group', { name: 'Time bar' });
    expect(within(bar).getByTestId('sky-status')).toHaveTextContent(/Sun (up [0-9]+°|down)/);
    expect(bar).not.toHaveTextContent(/Live|Simulated|Demo Mission|Now/);
    expect(screen.queryByRole('group', { name: 'Status' })).toBeNull();
    // The data source line says what the horizon is: flat, hills not included.
    expect(screen.getByText(/flat horizon \(hills not included\)/i)).toBeInTheDocument();
  });

  it('uses exactly the step 3 dates: 24–28 Nov can never show more than 5 days', async () => {
    await renderApp();
    if (!IM2) throw new Error('IM-2 missing');
    fireEvent.click(pastLanding(IM2.name));
    fireEvent.click(next());
    fireEvent.change(screen.getByRole('textbox', { name: 'Name (optional)' }), {
      target: { value: 'Test rover' },
    });
    fireEvent.click(next());
    // The stop date follows the start (14 days on) until it is set by hand.
    fireEvent.change(screen.getByLabelText('Start (UTC)'), { target: { value: '2026-11-24' } });
    expect(screen.getByLabelText('Stop (UTC)')).toHaveValue('2026-12-08');
    fireEvent.change(screen.getByLabelText('Stop (UTC)'), { target: { value: '2026-11-28' } });
    fireEvent.change(screen.getByLabelText('Start (UTC)'), { target: { value: '2026-11-25' } });
    expect(screen.getByLabelText('Stop (UTC)')).toHaveValue('2026-11-28');
    fireEvent.change(screen.getByLabelText('Start (UTC)'), { target: { value: '2026-11-24' } });
    fireEvent.click(next());
    const tiles = screen.getByRole('list', { name: 'Checks' });
    const days = [...tiles.textContent.matchAll(/(\d+\.\d) days/g)].map((m) => Number(m[1]));
    expect(days).toHaveLength(3);
    for (const value of days) expect(value).toBeLessThanOrEqual(5);
    // The time bar covers the same dates.
    expect(screen.getByRole('group', { name: 'Time bar' })).toHaveTextContent(/24 Nov.*29 Nov/);
  });

  it('Results follow new step 3 dates after Results was shown (IM-2, 21 Nov – 6 Dec)', async () => {
    await renderApp();
    if (!IM2) throw new Error('IM-2 missing');
    fireEvent.click(pastLanding(IM2.name));
    fireEvent.click(next());
    fireEvent.click(next());
    fireEvent.click(next());
    const tilesText = () => screen.getByRole('list', { name: 'Checks' }).textContent;
    fireEvent.click(back());
    fireEvent.change(screen.getByLabelText('Start (UTC)'), { target: { value: '2026-11-21' } });
    fireEvent.change(screen.getByLabelText('Stop (UTC)'), { target: { value: '2026-12-06' } });
    fireEvent.click(next());
    // The Sun sets at IM-2 on 1 Dec: not every hour of the dates is up.
    expect(tilesText()).toMatch(/Sun up10\.0 days.*Earth in view13\.4 days.*together10\.0 days/);
  });

  it('puts More details above Compare, with the details in the new order', async () => {
    await renderApp();
    walkToResults();
    const results = screen.getByRole('article', { name: new RegExp(IM2?.name ?? '') });
    const buttons = within(results)
      .getAllByRole('button')
      .map((button) => button.textContent);
    expect(buttons.indexOf('More details ›')).toBeGreaterThan(-1);
    expect(buttons.indexOf('More details ›')).toBeLessThan(
      buttons.indexOf('Compare with another location'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'More details ›' }));
    const names = screen
      .getAllByRole('button', { expanded: false })
      .map((button) => button.textContent ?? '')
      .filter((text) =>
        /^(This spot|Sun and Earth over the year|Sky chart|Best window|Power & battery|Share)/.test(
          text,
        ),
      )
      .map((text) =>
        text
          .replace(/[+:].*$/, '')
          .replace(/ ?[0-9].*$/, '')
          .trim(),
      );
    // Sections present, in order (the year rows only appear when they have data).
    const order = ['This spot', 'Sky chart', 'Best window', 'Power & battery', 'Share'];
    const found = order.filter((name) => names.includes(name));
    expect(found).toEqual(order);
    expect(order.map((name) => names.indexOf(name))).toEqual(
      [...order.map((name) => names.indexOf(name))].sort((x, y) => x - y),
    );
  });

  it('keeps one floating thing open: the rail closes the time bar, opening it again works', async () => {
    await renderApp();
    walkToResults();
    expect(screen.getByRole('group', { name: 'Time bar' })).toBeInTheDocument();
    fireEvent.click(railItem('Compare'));
    expect(screen.queryByRole('group', { name: 'Time bar' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open the time bar' }));
    expect(screen.getByRole('group', { name: 'Time bar' })).toBeInTheDocument();
    const layers = screen.queryByRole('button', { name: 'Layers' });
    if (layers) {
      // Layers closes the time bar; the time bar closes Layers.
      fireEvent.click(layers);
      expect(screen.queryByRole('group', { name: 'Time bar' })).toBeNull();
      expect(layers).toHaveAttribute('aria-expanded', 'true');
      fireEvent.click(screen.getByRole('button', { name: 'Open the time bar' }));
      expect(layers).toHaveAttribute('aria-expanded', 'false');
    }
  });

  it('names the three ways to choose a place, and saves a place with a name', async () => {
    window.localStorage.clear();
    await renderApp();
    for (const heading of [
      'Click anywhere on the Moon',
      'Pick a past landing',
      'Type coordinates',
    ]) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    }
    expect(screen.getAllByText('or')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Save this place/ })).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Go to coordinates' }), {
      target: { value: '-84.79, 29.20' },
    });
    fireEvent.click(screen.getByRole('button', { name: '☆ Save this place' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Name this place' }), {
      target: { value: 'Rim camp' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const saved = screen.getByRole('region', { name: 'Saved places' });
    expect(within(saved).getByRole('button', { name: 'Rim camp' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '★ Saved' })).toBeDisabled();
    fireEvent.click(within(saved).getByRole('button', { name: 'Remove Rim camp' }));
    expect(screen.queryByRole('region', { name: 'Saved places' })).toBeNull();
    window.localStorage.clear();
  });

  it("loads a recommended window's dates with Go, everywhere", async () => {
    await renderApp();
    walkToResults();
    const results = screen.getByRole('article', { name: new RegExp(IM2?.name ?? '') });
    const go = within(results).queryAllByRole('button', { name: /^Go to / });
    if (go.length === 0) {
      expect(results).toHaveTextContent('No good dates in the next 6 months');
      return;
    }
    const first = go[0];
    if (!first) throw new Error('no Go');
    const label = first.getAttribute('aria-label') ?? '';
    fireEvent.click(first);
    // Step 3 now holds those dates.
    fireEvent.click(back());
    const startText = label.replace(/^Go to /, '').split(' – ')[0] ?? '';
    const start = screen.getByLabelText('Start (UTC)') as HTMLInputElement;
    const day = Number(startText.split(' ')[0]);
    expect(Number(start.value.slice(8, 10))).toBe(day);
  });

  it('opens More details beside the wizard: sections closed, one open at a time', async () => {
    await renderApp();
    walkToResults();
    fireEvent.click(screen.getByRole('button', { name: 'More details ›' }));
    const panel = screen.getByRole('complementary', { name: 'More details' });
    const toggles = within(panel)
      .getAllByRole('button')
      .filter((button) => button.hasAttribute('aria-expanded'));
    expect(toggles.every((button) => button.getAttribute('aria-expanded') === 'false')).toBe(true);
    fireEvent.click(within(panel).getByRole('button', { name: /This spot/ }));
    fireEvent.click(within(panel).getByRole('button', { name: /Best window/ }));
    expect(within(panel).getByRole('button', { name: /This spot/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(within(panel).getByRole('button', { name: /Best window/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    // Rows that are still unavailable are hidden (the year's PGDA rows, and here the Earth too).
    expect(panel).not.toHaveTextContent(/Unavailable/);
    expect(panel).toHaveTextContent('Earth in view does not guarantee a radio link.');
    fireEvent.click(within(panel).getByRole('button', { name: 'Close details' }));
    expect(screen.queryByRole('complementary', { name: 'More details' })).toBeNull();
  });

  it('opens Compare with this location already in, for the same mission', async () => {
    await renderApp();
    walkToResults();
    fireEvent.click(screen.getByRole('button', { name: 'Compare with another location' }));
    const add = screen.getByRole('group', { name: 'Past landings to compare' });
    expect(within(add).getByRole('button', { name: IM2?.name ?? '' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(railItem('Compare')).toHaveAccessibleName('Compare, 1 picked');
  });

  it('uses the past landing when typed coordinates match it', async () => {
    await renderApp();
    fireEvent.change(screen.getByRole('textbox', { name: 'Go to coordinates' }), {
      target: { value: '-84.7906, 29.1957' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    // IM-2 Athena itself (its JPL Horizons files when they load), not a point at those coordinates.
    expect(pastLanding(IM2?.name ?? '')).toHaveAttribute('aria-pressed', 'true');
  });

  it('fills the box from a map click; typing a valid point enables Next; a bad one says so in red', async () => {
    await renderApp();
    const box = screen.getByRole('textbox', { name: 'Go to coordinates' });
    expect(box).toHaveAttribute('placeholder', '-84.79, 29.20');
    expect(next()).toBeDisabled();
    // A click on the map: the box takes that point, two decimals, and Next opens.
    fireEvent.click(screen.getByRole('button', { name: 'simulate ground click' }));
    expect(box).toHaveValue('20.25, 40.50');
    expect(next()).toBeEnabled();
    // Next works as soon as the box holds a valid point, even before Go.
    fireEvent.change(box, { target: { value: '-80, 10' } });
    expect(next()).toBeEnabled();
    // An entry that cannot be read: one short red line, and Next waits.
    fireEvent.change(box, { target: { value: 'nowhere' } });
    expect(next()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(screen.getByText('Use latitude, longitude, e.g. -84.79, 29.20')).toBeInTheDocument();
  });

  it('compares your own typed and clicked locations next to past landings', async () => {
    await renderApp();
    // A typed location in the Location step is remembered for Compare.
    fireEvent.change(screen.getByRole('textbox', { name: 'Go to coordinates' }), {
      target: { value: '-85.5, 31' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    fireEvent.click(railItem('Compare'));
    const yours = screen.getByRole('group', { name: 'Your locations to compare' });
    const typed = within(yours).getByRole('button', { name: /85\.5/ });
    expect(typed).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(typed);
    expect(typed).toHaveAttribute('aria-pressed', 'true');
    // Coordinates typed in Compare go straight in.
    fireEvent.change(screen.getByRole('textbox', { name: 'Go to coordinates' }), {
      target: { value: '-88, 10' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(within(yours).getByRole('button', { name: /88/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(railItem('Compare')).toHaveAccessibleName('Compare, 2 picked');
    // Two columns: no "nothing to compare" message.
    expect(screen.queryByText('Nothing to compare yet')).toBeNull();
  });

  it('follows the wizard in the breadcrumb: Moon › location › mission', async () => {
    await renderApp();
    walkToResults('Test rover');
    const crumbs = within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getAllByRole(
      'button',
    );
    expect(crumbs.map((crumb) => crumb.textContent)).toEqual(['Moon', IM2?.name, 'Test rover']);
    const [, location] = crumbs;
    if (location) fireEvent.click(location);
    expect(currentStep()).toHaveTextContent('Location');
  });

  it('shares the location, the mission and the time in the link', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    await renderApp();
    walkToResults('Test rover');
    fireEvent.click(screen.getByRole('button', { name: 'More details ›' }));
    fireEvent.click(screen.getByRole('button', { name: /^Share/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy a link to these results' }));
      await Promise.resolve();
    });
    const url = String((writeText.mock.calls as unknown as string[][])[0]?.[0]);
    expect(url).toContain('name=Test+rover');
    expect(url).toContain('site=im2');
    expect(url).toContain('from=2026-11-15&to=2026-11-29');
  });

  it('opens a complete shared link on its results', async () => {
    window.history.replaceState(
      null,
      '',
      '/#name=Linked&sun=1&earth=1&days=1&site=im2&from=2026-11-15&to=2026-11-29&t=2026-11-15T02:00:00.000Z',
    );
    await renderApp();
    expect(currentStep()).toHaveTextContent('Results');
    expect(screen.getByRole('article', { name: new RegExp(IM2?.name ?? '') })).toBeInTheDocument();
  });
});

describe('About', () => {
  it('opens from the rail, with no tour, demo or Lessons buttons', async () => {
    await renderApp();
    fireEvent.click(railItem('About'));
    const dialog = screen.getByRole('dialog');
    for (const name of ['Take the tour', 'Watch the short demo', 'Lessons from past landings']) {
      expect(within(dialog).queryByRole('button', { name })).toBeNull();
    }
    expect(dialog).toHaveTextContent(/four steps/);
  });
});

describe('Map', () => {
  it('has the time bar closed as a small Time button, and opens it by itself on Results', async () => {
    await renderApp();
    // Steps 1 to 3: only the button.
    expect(screen.getByRole('button', { name: 'Open the time bar' })).toHaveTextContent('Time');
    expect(screen.queryByRole('group', { name: 'Time bar' })).toBeNull();
    walkToResults();
    // Step 4 opens it; the X closes it, the button opens it again.
    const close = screen.getByRole('button', { name: 'Close the time bar' });
    expect(screen.getByRole('group', { name: 'Time bar' })).toBeInTheDocument();
    fireEvent.click(close);
    expect(screen.queryByRole('group', { name: 'Time bar' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open the time bar' }));
    expect(screen.getByRole('button', { name: 'Close the time bar' })).toBeInTheDocument();
  });

  it('moves the time bar window with the playhead, with the dates and Results unchanged', async () => {
    await renderApp();
    walkToResults();
    const bar = screen.getByRole('group', { name: 'Time bar' });
    expect(bar).toHaveTextContent(/15 Nov.*30 Nov/);
    expect(screen.queryByRole('button', { name: 'Back to my dates' })).toBeNull();
    const results = screen.getByRole('article', { name: new RegExp(IM2?.name ?? '') });
    const before = results.textContent;
    // Past the end of the window (28 Dec): the window moves, the same width, around it.
    const test = (window as unknown as { __starreactionTest: { setTime: (ms: number) => void } })
      .__starreactionTest;
    act(() => test.setTime(Date.UTC(2026, 11, 28)));
    expect(screen.getByRole('group', { name: 'Time bar' })).toHaveTextContent(/20 Dec.*4 Jan/);
    // The Results still use the step 3 dates.
    expect(screen.getByRole('article', { name: new RegExp(IM2?.name ?? '') }).textContent).toBe(
      before,
    );
    // Back to my dates returns the view only.
    fireEvent.click(screen.getByRole('button', { name: 'Back to my dates' }));
    expect(screen.getByRole('group', { name: 'Time bar' })).toHaveTextContent(/15 Nov.*30 Nov/);
    // Before the start: the window moves back too.
    act(() => test.setTime(Date.UTC(2026, 10, 3)));
    expect(screen.getByRole('group', { name: 'Time bar' })).toHaveTextContent(/1 Nov.*16 Nov/);
    // Past the end of the data: it stops at the edge and says so.
    act(() => test.setTime(Date.UTC(2028, 2, 1)));
    expect(screen.getByRole('group', { name: 'Time bar' })).toHaveTextContent(
      'No data after 31 Dec 2027',
    );
  });

  it('opens on Top and offers 3D', async () => {
    await renderApp();
    expect(screen.getByRole('button', { name: 'Top' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '3D' }));
    expect(screen.getByRole('button', { name: '3D' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('has a Layers button at the bottom left that opens the layer tiles', async () => {
    await renderApp();
    const button = screen.getByRole('button', { name: 'Layers' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    const panel = screen.getByRole('region', { name: 'Layers' });
    expect(within(panel).getByRole('list', { name: 'Layers to show' })).toBeInTheDocument();
    expect(within(panel).queryByRole('slider')).toBeNull();
    for (const name of [/^Elevation$/, /^Slope$/]) {
      expect(within(panel).getByRole('button', { name })).toBeInTheDocument();
    }
    // Sun and Earth visibility are hidden behind a flag for now (see Future plans on About).
    expect(within(panel).queryByRole('button', { name: /^Sun visibility/ })).toBeNull();
    expect(within(panel).queryByRole('button', { name: /^Earth visibility/ })).toBeNull();
    expect(within(panel).queryByText('Preview')).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: 'Close map layers' }));
    expect(screen.queryByRole('region', { name: 'Layers' })).toBeNull();
  });
});

describe('Power and battery, and the Moon Power Lab', () => {
  it('keeps four lines, no sliders, and opens the pop-up from "Design your own battery"', async () => {
    await renderApp();
    walkToResults();
    fireEvent.click(screen.getByRole('button', { name: 'More details ›' }));
    fireEvent.click(screen.getByRole('button', { name: /^Power & battery/ }));
    const power = screen.getByTestId('power-check');
    for (const label of ['Sun now', 'Panel power now (flat 1 m² panel)', 'Battery needed']) {
      expect(within(power).getByText(label)).toBeInTheDocument();
    }
    expect(power).toHaveTextContent(/Longest night/);
    // No night in these dates: it says so, never "0.0 kg".
    expect(power).toHaveTextContent(/Battery neededNo night in these dates/);
    expect(power).not.toHaveTextContent('0.0 kg');
    expect(within(power).queryByRole('slider')).toBeNull();
    expect(power).not.toHaveTextContent(/Power details|Survives|Teaching defaults|1361|143 Wh\/kg/);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(within(power).getByRole('button', { name: 'Design your own battery →' }));
    const dialog = screen.getByRole('dialog', { name: 'Moon Power Lab' });
    expect(dialog).toHaveTextContent(
      'How big a battery does a lander need to survive the Moon night?',
    );
    const link = within(dialog).getByRole('link', { name: 'Open the Moon Power Lab →' });
    expect(link).toHaveAttribute('href', '/power-lab.html');
    expect(link).toHaveAttribute('target', '_blank');
    // The results underneath are untouched; the X, a click outside and Escape each close it.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close the Moon Power Lab' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(within(power).getByRole('button', { name: 'Design your own battery →' }));
    fireEvent.click(screen.getByTestId('power-lab-backdrop'));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(within(power).getByRole('button', { name: 'Design your own battery →' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('puts Power Lab in the rail under Compare, with its panel, and the name off the page', async () => {
    await renderApp();
    const names = within(screen.getByRole('navigation', { name: 'Menu' }))
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent);
    expect(names.indexOf('Power Lab')).toBe(names.findIndex((n) => n?.startsWith('Compare')) + 1);
    fireEvent.click(railItem('Power Lab'));
    const panel = screen.getByRole('region', { name: 'Moon Power Lab' });
    expect(panel).toHaveTextContent(/Try panel size, Sun height and night length/);
    expect(document.body).not.toHaveTextContent(/Miral/);
  });
});
