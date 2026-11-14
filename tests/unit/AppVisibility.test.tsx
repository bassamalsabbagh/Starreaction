import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { App } from '../../src/app/App';

// The visibility prototype in the app, with the globe's stand-in (jsdom has no WebGL), so no frame
// is ever applied here: this checks the wiring of the panel, the time and the readings choice. The
// controller and the data have their own tests (tests/unit/features/lunar-map/visibility*).
vi.mock('../../src/features/lunar-map/MoonGlobe', () => import('../mocks/MoonGlobe'));
// The tile is off until its browser check passes; these tests switch it on to keep it working.
vi.mock('../../src/app/featureFlags', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/app/featureFlags')>()),
  VISIBILITY_VERIFIED: true,
}));
beforeAll(async () => {
  await import('../mocks/MoonGlobe');
});
vi.mock('../../src/features/lunar-map/useHorizonsSeries', () => {
  const none = { series: new Map(), settled: false };
  return { useHorizonsSeries: () => none };
});

function freezeTime(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

async function openLayers() {
  render(<App />);
  await screen.findByTestId('moon-globe', {}, { timeout: 5000 });
  fireEvent.click(screen.getByRole('button', { name: 'Layers' }));
  return screen.getByRole('region', { name: 'Layers' });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Sun and Earth visibility in the Layers panel', () => {
  it('shows the Sun from its tile with one legend, one overlay at a time, slope unchanged', async () => {
    freezeTime('2026-11-30T12:07:00Z');
    const panel = await openLayers();
    const globe = screen.getByTestId('moon-globe');
    const sun = within(panel).getByRole('button', { name: /^Sun visibility/ });
    const earth = within(panel).getByRole('button', { name: /^Earth visibility/ });
    expect(sun).toHaveAttribute('aria-pressed', 'false');
    expect(within(panel).queryByText(/prototype/i)).toBeNull();
    fireEvent.click(sun);
    expect(sun).toHaveAttribute('aria-pressed', 'true');
    expect(earth).toHaveAttribute('aria-pressed', 'false');
    // The legend sits under the row; no explanation lines (they are on the About page).
    expect(
      within(panel).queryByText(/Geometric visibility|NASA lighting maps|not a share of time lit/),
    ).toBeNull();
    expect(within(panel).getAllByRole('figure')).toHaveLength(1);
    expect(within(panel).queryByRole('radio')).toBeNull();

    // Slope on too: its legend joins the Sun's; the Sun overlay stays on.
    fireEvent.click(within(panel).getByRole('button', { name: 'Slope' }));
    expect(globe).toHaveAttribute('data-layers', 'slope:0.8');
    expect(within(panel).getAllByRole('figure')).toHaveLength(2);
    expect(within(panel).getByRole('figure', { name: 'Slope legend, °' })).toBeInTheDocument();

    // The Earth tile: one overlay at a time.
    fireEvent.click(earth);
    expect(earth).toHaveAttribute('aria-pressed', 'true');
    expect(sun).toHaveAttribute('aria-pressed', 'false');
    expect(globe).toHaveAttribute('data-layers', 'slope:0.8');

    // Its tile again switches it off.
    fireEvent.click(earth);
    expect(earth).toHaveAttribute('aria-pressed', 'false');
  });

  it('says there is no frame outside 24 Nov–8 Dec 2026', async () => {
    freezeTime('2026-11-15T02:00:00Z');
    const panel = await openLayers();
    fireEvent.click(within(panel).getByRole('button', { name: /^Sun visibility/ }));
    expect(within(panel).getByTestId('visibility-frame')).toHaveTextContent(
      'No frame for this time (frames: 24 Nov–8 Dec 2026 UTC)',
    );
  });

  it('leaves the globe shading alone: on, at any opacity, it is shaded as with it off', async () => {
    freezeTime('2026-11-30T12:07:00Z');
    const panel = await openLayers();
    const globe = screen.getByTestId('moon-globe');
    const off = globe.getAttribute('data-shade-cut');
    fireEvent.click(within(panel).getByRole('button', { name: /^Sun visibility/ }));
    expect(globe).toHaveAttribute('data-shade-cut', off ?? '');
    fireEvent.click(within(panel).getByRole('button', { name: /^Earth visibility/ }));
    expect(globe).toHaveAttribute('data-shade-cut', off ?? '');
    // Elevation (an opaque colour map) still cuts it, as before.
    fireEvent.click(within(panel).getByRole('button', { name: 'Elevation' }));
    expect(globe.getAttribute('data-shade-cut')).not.toBe(off);
  });

  it('closes with Escape', async () => {
    freezeTime('2026-11-15T02:00:00Z');
    await openLayers();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Layers' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Layers' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});
