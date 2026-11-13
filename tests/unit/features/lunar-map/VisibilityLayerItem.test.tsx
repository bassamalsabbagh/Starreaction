import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { LayerPanel } from '../../../../src/features/lunar-map/LayerPanel';
import {
  FAILURE_SHOW_MS,
  useVisibilityLayer,
} from '../../../../src/features/lunar-map/useVisibilityLayer';
import {
  IDLE_RUNTIME,
  INITIAL_VISIBILITY,
  VISIBILITY_LABEL,
  type VisibilityReadout,
  type VisibilityRuntime,
  type VisibilitySettings,
  type VisibilityTarget,
} from '../../../../src/features/lunar-map/visibilityLayer';

// The manifest's colours (public/data/visibility-cap/manifest.json).
const COLORS = {
  '0': '#081246',
  '0.25': '#0073d2',
  '0.5': '#00cdaf',
  '0.75': '#f5da2d',
  '1': '#ff5b18',
};
const READY: VisibilityRuntime = {
  ...IDLE_RUNTIME,
  status: 'ready',
  appliedTime: '2026-11-30T12:10:00Z',
  colors: COLORS,
};
const ON: VisibilitySettings = { ...INITIAL_VISIBILITY, on: true, started: true };

function renderPanel(
  options: {
    settings?: VisibilitySettings;
    runtime?: VisibilityRuntime;
    frame?: string | null;
    activeTarget?: VisibilityTarget | null;
    readout?: VisibilityReadout | null;
  } = {},
) {
  const handlers = {
    onToggle: vi.fn(),
    onToggleTarget: vi.fn(),
    onOpacity: vi.fn(),
    onActiveTarget: vi.fn(),
  };
  render(
    <LayerPanel
      layers={[]}
      settings={{}}
      onToggle={vi.fn()}
      onOpacity={vi.fn()}
      activeId={null}
      onActive={vi.fn()}
      reading={null}
      onClose={vi.fn()}
      sourceId="SRC-073"
      visibility={{
        settings: options.settings ?? ON,
        runtime: options.runtime ?? READY,
        frame: options.frame === undefined ? '2026-11-30T12:10:00Z' : options.frame,
        activeTarget: options.activeTarget ?? null,
        readout: options.readout ?? null,
        ...handlers,
      }}
    />,
  );
  return handlers;
}

describe('Visibility layer in the map layers panel', () => {
  it('starts with one switch; switching it on is the parent’s call', () => {
    const handlers = renderPanel({ settings: INITIAL_VISIBILITY, runtime: IDLE_RUNTIME });
    const main = screen.getByRole('checkbox', { name: 'Visibility (prototype)' });
    expect(main).not.toBeChecked();
    expect(screen.queryByRole('checkbox', { name: 'Sun visibility (prototype)' })).toBeNull();
    fireEvent.click(main);
    expect(handlers.onToggle).toHaveBeenCalledOnce();
  });

  it('shows Sun and Earth switches and opacity, the legend, the label and the frame shown', () => {
    const handlers = renderPanel();
    expect(screen.getByRole('checkbox', { name: 'Sun visibility (prototype)' })).toBeChecked();
    const earth = screen.getByRole('checkbox', { name: 'Earth visibility (prototype)' });
    expect(earth).not.toBeChecked();
    fireEvent.click(earth);
    expect(handlers.onToggleTarget).toHaveBeenCalledWith('earth');
    const sunOpacity = screen.getByRole('slider', { name: 'Sun visibility (prototype) opacity' });
    expect(sunOpacity).toHaveValue('80');
    fireEvent.change(sunOpacity, { target: { value: '35' } });
    expect(handlers.onOpacity).toHaveBeenCalledWith('sun', 0.35);
    expect(
      screen.getByRole('slider', { name: 'Earth visibility (prototype) opacity' }),
    ).toBeInTheDocument();

    const legend = screen.getByRole('figure', { name: 'Visibility legend, % of the disc' });
    expect(legend).toHaveTextContent('0 %');
    expect(legend).toHaveTextContent('50 %');
    expect(legend).toHaveTextContent('100 %');
    expect(screen.getByText(VISIBILITY_LABEL)).toBeInTheDocument();
    expect(VISIBILITY_LABEL).toBe(
      'Prototype geometric visibility · 9.6 km grid · 2 m assumed height · eclipses not modeled',
    );
    expect(screen.getByTestId('visibility-frame')).toHaveTextContent(
      'Frame shown: 2026-11-30 12:10 UTC',
    );
    expect(screen.getByText(/not a share of time lit/)).toBeInTheDocument();
  });

  it('keeps the shown frame’s time while the next loads, and says so', () => {
    renderPanel({ runtime: { ...READY, loading: true }, frame: '2026-11-30T12:20:00Z' });
    expect(screen.getByTestId('visibility-frame')).toHaveTextContent(
      'Frame shown: 2026-11-30 12:10 UTC · loading the new frame…',
    );
  });

  it('says when the time has no frame', () => {
    renderPanel({ frame: null });
    expect(screen.getByTestId('visibility-frame')).toHaveTextContent(
      'No frame for this time (frames: 24 Nov–8 Dec 2026 UTC)',
    );
  });

  it('shows a load failure', () => {
    renderPanel({ runtime: { ...READY, failed: true } });
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn’t load the visibility frame/);
  });

  it('turns the switch off with a note when the manifest could not be read', () => {
    renderPanel({ runtime: { ...IDLE_RUNTIME, status: 'unavailable' } });
    expect(screen.getByRole('checkbox', { name: 'Visibility (prototype)' })).toBeDisabled();
    expect(screen.getByText(/Visibility layer unavailable/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Sun visibility (prototype)' })).toBeNull();
  });

  it('offers the shown targets under Readings from, and shows their readout', () => {
    const handlers = renderPanel({
      settings: { ...ON, earth: { visible: true, opacity: 0.8 } },
      activeTarget: 'sun',
      readout: { main: 'Approx. visible disc: 0 %', detail: '9.6 km grid · 2026-11-30 12:10 UTC' },
    });
    const group = screen.getByRole('group', { name: 'Readings from' });
    expect(within(group).getByRole('radio', { name: 'Sun visibility (prototype)' })).toBeChecked();
    fireEvent.click(within(group).getByRole('radio', { name: 'Earth visibility (prototype)' }));
    expect(handlers.onActiveTarget).toHaveBeenCalledWith('earth');
    const readout = screen.getByTestId('visibility-readout');
    expect(readout).toHaveTextContent('Approx. visible disc: 0 %');
    expect(readout).toHaveTextContent('9.6 km grid · 2026-11-30 12:10 UTC');
    expect(readout).toHaveTextContent(/not DSN link availability/);
  });
});

describe('useVisibilityLayer', () => {
  const IN_RANGE = Date.parse('2026-11-30T12:07:00Z');

  it('loads nothing until first switched on, then shows the Sun and follows it', () => {
    const { result } = renderHook(() => useVisibilityLayer(IN_RANGE));
    expect(result.current.display.load).toBe(false);
    expect(result.current.frame).toBe('2026-11-30T12:10:00Z');
    act(() => result.current.toggle());
    expect(result.current.display.load).toBe(true);
    expect(result.current.display.sun.visible).toBe(true);
    expect(result.current.display.earth.visible).toBe(false);
    expect(result.current.prefer).toBe('sun');
    act(() => result.current.toggleTarget('earth'));
    expect(result.current.prefer).toBe('earth');
    act(() => result.current.toggle());
    expect(result.current.display.sun.visible).toBe(false);
    expect(result.current.display.load).toBe(true);
  });

  it('reads the applied frame through the globe’s sampler', () => {
    const { result } = renderHook(() => useVisibilityLayer(IN_RANGE));
    expect(result.current.readAt('sun', { lat: -89, lon: 0 }).main).toBe('Loading visibility…');
    const sample = vi.fn(() => ({
      fraction: 0.5,
      percentage: 50,
      timeUTC: '2026-11-30T12:10:00Z',
    }));
    act(() =>
      result.current.report({ status: 'ready', appliedTime: '2026-11-30T12:10:00Z', sample }),
    );
    expect(result.current.readAt('sun', { lat: -89, lon: 12 }).main).toBe(
      'Approx. visible disc: 50 %',
    );
    expect(sample).toHaveBeenCalledWith('sun', 12, -89);
  });

  it('clears a failure after a short while', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useVisibilityLayer(IN_RANGE));
      act(() => result.current.report({ failed: true }));
      expect(result.current.runtime.failed).toBe(true);
      act(() => vi.advanceTimersByTime(FAILURE_SHOW_MS));
      expect(result.current.runtime.failed).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('has no frame outside 24 Nov–8 Dec 2026', () => {
    const { result } = renderHook(() => useVisibilityLayer(Date.parse('2026-12-09T00:00:00Z')));
    act(() => result.current.toggle());
    expect(result.current.frame).toBeNull();
    expect(result.current.display.sun.visible).toBe(false);
  });
});
