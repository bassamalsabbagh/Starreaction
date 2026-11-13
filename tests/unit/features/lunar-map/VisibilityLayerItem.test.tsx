import { readFileSync } from 'node:fs';
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
import palette from '../../../../src/data/visibility/palette.json';

const READY: VisibilityRuntime = {
  ...IDLE_RUNTIME,
  status: 'ready',
  appliedTime: '2026-11-30T12:10:00Z',
};
const ON: VisibilitySettings = { ...INITIAL_VISIBILITY, on: true, started: true };

/** "#7a3d00" → "122, 61, 0", as it appears inside the legend's rgba() colours. */
const rgb = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
};

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
    onChoose: vi.fn(),
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
    expect(screen.queryByRole('group', { name: 'Visibility overlay' })).toBeNull();
    fireEvent.click(main);
    expect(handlers.onToggle).toHaveBeenCalledOnce();
  });

  it('offers Sun | Earth buttons, one pressed, and the opacity of the one shown', () => {
    const handlers = renderPanel({ settings: { ...ON, opacity: { sun: 0.8, earth: 0.35 } } });
    const group = screen.getByRole('group', { name: 'Visibility overlay' });
    const sun = within(group).getByRole('button', { name: 'Sun' });
    const earth = within(group).getByRole('button', { name: 'Earth' });
    expect(sun).toHaveAttribute('aria-pressed', 'true');
    expect(earth).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(earth);
    expect(handlers.onChoose).toHaveBeenCalledWith('earth');
    // Only the shown overlay's slider, at its own opacity.
    const slider = screen.getByRole('slider', { name: 'Sun visibility (prototype) opacity' });
    expect(slider).toHaveValue('80');
    expect(
      screen.queryByRole('slider', { name: 'Earth visibility (prototype) opacity' }),
    ).toBeNull();
    fireEvent.change(slider, { target: { value: '35' } });
    expect(handlers.onOpacity).toHaveBeenCalledWith('sun', 0.35);
  });

  it('shows the Earth’s own opacity when the Earth is the overlay', () => {
    renderPanel({ settings: { ...ON, active: 'earth', opacity: { sun: 0.8, earth: 0.35 } } });
    expect(screen.getByRole('button', { name: 'Earth' })).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('slider', { name: 'Earth visibility (prototype) opacity' }),
    ).toHaveValue('35');
  });

  for (const target of ['sun', 'earth'] as const) {
    it(`draws the ${target} legend in its own palette, transparent at 0 %`, () => {
      renderPanel({ settings: { ...ON, active: target } });
      const name = target === 'sun' ? 'Sun' : 'Earth';
      const legend = screen.getByRole('figure', {
        name: `${name} visibility (prototype) legend, % of the disc`,
      });
      expect(legend).toHaveTextContent('0 % (transparent)');
      expect(legend).toHaveTextContent('50 %');
      expect(legend).toHaveTextContent('100 %');
      const background = screen.getByTestId(`visibility-legend-${target}`).style.background;
      const stops = palette[target].stops;
      // Fully transparent at 0, then each palette colour; the last is opaque (jsdom writes it
      // as rgb()).
      expect(background).toContain(`rgba(${rgb(stops[0]?.color ?? '')}, 0) 0.00%`);
      expect(background).toContain(`rgba(${rgb(stops[1]?.color ?? '')}, 0.65) 50.00%`);
      expect(background).toContain(`rgb(${rgb(stops[2]?.color ?? '')}) 100.00%`);
      // Not the other overlay's colours.
      const other = palette[target === 'sun' ? 'earth' : 'sun'].stops;
      expect(background).not.toContain(rgb(other[1]?.color ?? ''));
    });
  }

  it('keeps the label, the meaning and the frame shown', () => {
    renderPanel();
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
    expect(screen.queryByRole('group', { name: 'Visibility overlay' })).toBeNull();
  });

  it('offers the shown overlay under Readings from, and shows its readout', () => {
    renderPanel({
      settings: { ...ON, active: 'earth' },
      activeTarget: 'earth',
      readout: { main: 'Approx. visible disc: 0 %', detail: '9.6 km grid · 2026-11-30 12:10 UTC' },
    });
    const group = screen.getByRole('group', { name: 'Readings from' });
    const radio = within(group).getByRole('radio', { name: 'Earth visibility (prototype)' });
    expect(radio).toBeChecked();
    expect(within(group).queryByRole('radio', { name: 'Sun visibility (prototype)' })).toBeNull();
    const readout = screen.getByTestId('visibility-readout');
    expect(readout).toHaveTextContent('Approx. visible disc: 0 %');
    expect(readout).toHaveTextContent('9.6 km grid · 2026-11-30 12:10 UTC');
    expect(readout).toHaveTextContent(/not DSN link availability/);
  });
});

describe('Visibility panel on a narrow (~360 px) screen', () => {
  it('renders the buttons and the legend at phone width', () => {
    const width = window.innerWidth;
    window.innerWidth = 360;
    try {
      renderPanel();
      expect(screen.getByRole('group', { name: 'Visibility overlay' })).toBeInTheDocument();
      expect(screen.getByTestId('visibility-legend-sun')).toBeInTheDocument();
    } finally {
      window.innerWidth = width;
    }
  });

  // jsdom does no layout, so the CSS that keeps them inside the panel is checked as written.
  it('lets the buttons wrap and shrink instead of overflowing', () => {
    const css = readFileSync('src/features/lunar-map/VisibilityLayerItem.module.css', 'utf8');
    const rule = (name: string) => css.match(new RegExp(`\\.${name} \\{([^}]*)\\}`))?.[1] ?? '';
    expect(rule('segmented')).toMatch(/flex-wrap: wrap/);
    expect(rule('segmented')).toMatch(/min-width: 0/);
    expect(rule('segment')).toMatch(/min-width: 0/);
    expect(rule('segment')).toMatch(/flex: 1 1 5rem/);
    expect(rule('legend')).toMatch(/min-width: 0/);
    expect(rule('unit')).toMatch(/text-wrap: pretty/);
    // The panel itself never grows past the screen: min(20rem, 100vw − 6rem) = 264 px at 360 px.
    const panelCss = readFileSync('src/features/lunar-map/LayerPanel.module.css', 'utf8');
    expect(panelCss).toMatch(/width: min\(20rem, calc\(100vw - 6rem\)\)/);
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
    act(() => result.current.toggle());
    expect(result.current.display.sun.visible).toBe(false);
    expect(result.current.display.load).toBe(true);
  });

  it('switches Sun ↔ Earth, one at a time, keeping each opacity', () => {
    const { result } = renderHook(() => useVisibilityLayer(IN_RANGE));
    act(() => result.current.toggle());
    act(() => result.current.setOpacity('sun', 0.6));
    act(() => result.current.choose('earth'));
    expect(result.current.display.sun.visible).toBe(false);
    expect(result.current.display.earth.visible).toBe(true);
    expect(result.current.prefer).toBe('earth');
    act(() => result.current.setOpacity('earth', 0.3));
    act(() => result.current.choose('sun'));
    expect(result.current.display.sun).toEqual({ visible: true, opacity: 0.6 });
    expect(result.current.display.earth).toEqual({ visible: false, opacity: 0.3 });
    expect(result.current.prefer).toBe('sun');
    // Off and on again: the chosen overlay is remembered.
    act(() => result.current.choose('earth'));
    act(() => result.current.toggle());
    act(() => result.current.toggle());
    expect(result.current.display.earth.visible).toBe(true);
    expect(result.current.prefer).toBe('earth');
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
