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
    onShow: vi.fn(),
    onOpacity: vi.fn(),
  };
  render(
    <LayerPanel
      layers={[]}
      settings={{}}
      onToggle={vi.fn()}
      readings={{}}
      onClose={vi.fn()}
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
  it('has a Sun and an Earth tile; showing one is the parent’s call', () => {
    const handlers = renderPanel({ settings: INITIAL_VISIBILITY, runtime: IDLE_RUNTIME });
    const sun = screen.getByRole('button', { name: /^Sun visibility/ });
    expect(sun).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('visibility-frame')).toBeNull();
    // A small grey "Preview" tag on the Sun and Earth visibility rows, and on no other row.
    expect(within(sun).getByText('Preview')).toBeInTheDocument();
    expect(
      within(screen.getByRole('button', { name: /^Earth visibility/ })).getByText('Preview'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Preview')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /^Earth visibility/ }));
    expect(handlers.onShow).toHaveBeenCalledWith('earth');
  });

  it('presses the tile of the overlay shown, and has no opacity slider (fixed opacity)', () => {
    renderPanel({ settings: { ...ON, opacity: { sun: 0.8, earth: 0.35 } } });
    expect(screen.getByRole('button', { name: /^Sun visibility/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /^Earth visibility/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.queryByRole('slider')).toBeNull();
  });

  for (const target of ['sun', 'earth'] as const) {
    it(`draws the ${target} legend in its own palette, transparent at 0 %`, () => {
      renderPanel({ settings: { ...ON, active: target } });
      const name = target === 'sun' ? 'Sun' : 'Earth';
      const legend = screen.getByRole('figure', {
        name: `${name} visibility legend, % of the disc`,
      });
      const ends = {
        sun: ['Rarely sunlit 0%', 'Often sunlit, more power 100%'],
        earth: ['Rarely in view 0%', 'Often in view, more contact 100%'],
      }[target];
      expect(legend).toHaveTextContent(ends.join(''));
      expect(legend.querySelectorAll('span')).toHaveLength(2);
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

  it('shows no explanation lines under the legend; only "No frame" when it applies', () => {
    renderPanel();
    // The explanations are on the About page.
    expect(screen.queryByText(/Preview:|Geometric visibility|not a share of time lit/)).toBeNull();
    expect(screen.queryByText(/South pole only/)).toBeNull();
    expect(screen.queryByTestId('visibility-frame')).toBeNull();
    expect(VISIBILITY_LABEL).toBe(
      'Geometric visibility · 9.6 km grid · 2 m assumed height · eclipses not modeled',
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
    expect(screen.getByRole('button', { name: /^Sun visibility/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Earth visibility/ })).toBeDisabled();
    expect(screen.getByText(/Visibility layer unavailable/)).toBeInTheDocument();
  });

  it('shows the readout of the overlay the readings follow, and no Readings from choice', () => {
    renderPanel({
      settings: { ...ON, active: 'earth' },
      activeTarget: 'earth',
      readout: { main: 'Approx. visible disc: 0 %', detail: '9.6 km grid · 2026-11-30 12:10 UTC' },
    });
    expect(screen.queryByRole('group', { name: 'Readings from' })).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    const readout = screen.getByTestId('visibility-readout');
    expect(readout).toHaveTextContent('Approx. visible disc: 0 %');
  });

  it('shows no readout box while there is nothing to read', () => {
    renderPanel({
      settings: { ...ON, active: 'earth' },
      activeTarget: 'earth',
      readout: {
        main: 'Point at the south pole, or tap it, to read the visibility.',
        detail: null,
      },
    });
    expect(screen.queryByTestId('visibility-readout')).toBeNull();
  });

  it('has no sources text and no "flat horizon" wording', () => {
    renderPanel();
    expect(screen.queryByText(/Source|Sources/)).toBeNull();
    expect(screen.queryByText(/flat horizon/i)).toBeNull();
  });
});

describe('Visibility panel on a narrow (~360 px) screen', () => {
  it('renders the buttons and the legend at phone width', () => {
    const width = window.innerWidth;
    window.innerWidth = 360;
    try {
      renderPanel();
      expect(screen.getByRole('list', { name: 'Layers to show' })).toBeInTheDocument();
      expect(screen.getByTestId('visibility-legend-sun')).toBeInTheDocument();
    } finally {
      window.innerWidth = width;
    }
  });

  // jsdom does no layout, so the CSS that keeps them inside the panel is checked as written.
  it('lets the tiles wrap and the legend shrink instead of overflowing', () => {
    const css = readFileSync('src/features/lunar-map/VisibilityLayerItem.module.css', 'utf8');
    const rule = (name: string) => css.match(new RegExp(`\\.${name} \\{([^}]*)\\}`))?.[1] ?? '';
    // The row of layers wraps instead of overflowing.
    const rowsCss = readFileSync('src/features/lunar-map/LayerPanel.module.css', 'utf8');
    expect(rowsCss.match(/\.rows \{([^}]*)\}/)?.[1] ?? '').toMatch(/flex-flow: row wrap/);
    expect(rule('legend')).toMatch(/min-width: 0/);
    expect(rule('unit')).toMatch(/text-wrap: pretty/);
    // The panel itself never grows past the screen.
    expect(rowsCss).toMatch(/width: min\(26rem, calc\(100vw - var\(--rail-width\) - 4rem\)\)/);
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
