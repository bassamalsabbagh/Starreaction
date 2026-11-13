import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { App } from '../../src/app/App';

// The visibility prototype in the app, with the globe's stand-in (jsdom has no WebGL), so no frame
// is ever applied here: this checks the wiring of the panel, the time and the readings choice. The
// controller and the data have their own tests (tests/unit/features/lunar-map/visibility*).
vi.mock('../../src/features/lunar-map/MoonGlobe', () => import('../mocks/MoonGlobe'));
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
  fireEvent.click(screen.getByRole('button', { name: 'Map layers' }));
  return screen.getByRole('region', { name: 'Map layers' });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Visibility (prototype) in the map layers panel', () => {
  it('starts with the Sun on, takes the readings, and leaves slope as it was', async () => {
    freezeTime('2026-11-30T12:07:00Z');
    const panel = await openLayers();
    const globe = screen.getByTestId('moon-globe');
    expect(
      within(panel).queryByRole('checkbox', { name: 'Sun visibility (prototype)' }),
    ).toBeNull();
    fireEvent.click(within(panel).getByRole('checkbox', { name: 'Visibility (prototype)' }));
    expect(
      within(panel).getByRole('checkbox', { name: 'Sun visibility (prototype)' }),
    ).toBeChecked();
    expect(
      within(panel).getByRole('checkbox', { name: 'Earth visibility (prototype)' }),
    ).not.toBeChecked();
    // No frame applied yet: loading, and no time claimed.
    expect(within(panel).getByTestId('visibility-frame')).toHaveTextContent(
      'Loading visibility frame…',
    );
    expect(within(panel).getByRole('radio', { name: 'Sun visibility (prototype)' })).toBeChecked();
    expect(within(panel).getByTestId('visibility-readout')).toHaveTextContent(
      'Loading visibility…',
    );

    // Slope switched on last takes the readings; the elevation and slope layers are unchanged.
    fireEvent.click(within(panel).getByRole('checkbox', { name: 'Slope' }));
    expect(globe).toHaveAttribute('data-layers', 'slope:0.8');
    expect(within(panel).getByRole('radio', { name: 'Slope' })).toBeChecked();
    expect(within(panel).queryByTestId('visibility-readout')).toBeNull();
    expect(within(panel).getByTestId('layer-readout')).toBeInTheDocument();

    // Picking the Sun again moves the readings back.
    fireEvent.click(within(panel).getByRole('radio', { name: 'Sun visibility (prototype)' }));
    expect(within(panel).getByTestId('visibility-readout')).toBeInTheDocument();
    expect(within(panel).getByRole('radio', { name: 'Slope' })).not.toBeChecked();

    // Switched off: no visibility choice left; slope reads again.
    fireEvent.click(within(panel).getByRole('checkbox', { name: 'Visibility (prototype)' }));
    expect(within(panel).queryByRole('radio', { name: 'Sun visibility (prototype)' })).toBeNull();
    expect(within(panel).getByRole('radio', { name: 'Slope' })).toBeChecked();
  });

  it('says there is no frame outside 24 Nov–8 Dec 2026', async () => {
    freezeTime('2026-11-15T02:00:00Z');
    const panel = await openLayers();
    fireEvent.click(within(panel).getByRole('checkbox', { name: 'Visibility (prototype)' }));
    expect(within(panel).getByTestId('visibility-frame')).toHaveTextContent(
      'No frame for this time (frames: 24 Nov–8 Dec 2026 UTC)',
    );
    expect(within(panel).getByTestId('visibility-readout')).toHaveTextContent(
      'No frame for this time',
    );
  });
});
