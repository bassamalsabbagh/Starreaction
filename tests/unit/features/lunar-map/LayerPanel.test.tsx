import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { ElevationLine } from '../../../../src/features/lunar-map/ElevationLine';
import { LayerPanel } from '../../../../src/features/lunar-map/LayerPanel';
import type { LayerSetting } from '../../../../src/features/lunar-map/mapLayerState';
import { useLayerReading } from '../../../../src/features/lunar-map/useLayerReading';
import { MAP_LAYERS, type LayerReading, type MapLayer } from '../../../../src/services/mapLayers';

const LAYERS = MAP_LAYERS?.layers ?? [];

/** A made-up copy of the elevation layer with no values (as when its file arrived empty). */
const NO_VALUES_REASON = 'The values file supplied (test.tif) is empty (0 bytes)';
const withoutElevationValues = (layers: readonly MapLayer[]): MapLayer[] =>
  layers.map((layer) =>
    layer.id === 'elevation'
      ? { ...layer, values: null, legend: null, valuesUnavailable: NO_VALUES_REASON }
      : layer,
  );

function renderPanel(
  settings: Record<string, LayerSetting>,
  options: {
    layers?: readonly MapLayer[];
    readings?: Record<string, LayerReading>;
    failedIds?: string[];
  } = {},
) {
  const props = {
    onToggle: vi.fn(),
    onClose: vi.fn(),
  };
  render(
    <LayerPanel
      layers={options.layers ?? LAYERS}
      settings={settings}
      readings={options.readings ?? {}}
      failedIds={options.failedIds}
      {...props}
    />,
  );
  return props;
}

describe.runIf(LAYERS.length > 0)('LayerPanel', () => {
  it('has a tile for every layer that switches it; no slider, no sources link, no radios', () => {
    const props = renderPanel({});
    fireEvent.click(screen.getByRole('button', { name: 'Slope' }));
    expect(props.onToggle).toHaveBeenCalledWith('slope');
    expect(screen.getByRole('button', { name: 'Elevation' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sources' })).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    // Nothing is switched on: no legend.
    expect(screen.queryByRole('figure')).toBeNull();
    // Elevation and Slope carry no Preview badge.
    expect(screen.queryByText('Preview')).toBeNull();
  });

  it('shows a legend under the row for each layer that is on, with only its two ends in words', () => {
    renderPanel({
      slope: { visible: true, opacity: 0.8 },
      elevation: { visible: true, opacity: 0.8 },
    });
    expect(screen.getAllByRole('figure')).toHaveLength(2);
    const legend = screen.getByRole('figure', { name: 'Elevation legend, m' });
    expect(legend).toHaveTextContent('Low (crater floors) -5.2 km');
    expect(legend).toHaveTextContent('High (ridges) +4.4 km');
    // No tick numbers in between, so none can overlap.
    expect(legend.querySelectorAll('span')).toHaveLength(2);
    // No explanation lines, no Preview badges, no sources: those are on the About page.
    expect(screen.queryByText(/South pole only/)).toBeNull();
    expect(screen.queryByText(/Slope is not a pass\/fail/)).toBeNull();
    expect(screen.queryByText(/Source/)).toBeNull();
    expect(screen.queryByText('Preview')).toBeNull();
  });

  it('lays the layers out in one row of small colour tiles with a name each', () => {
    renderPanel({});
    const row = screen.getByRole('list', { name: 'Layers to show' });
    const buttons = within(row).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual([
      'Elevation',
      'Slope',
      'Roughness',
    ]);
    const css = readFileSync('src/features/lunar-map/LayerPanel.module.css', 'utf8');
    expect(css.match(/\.rows \{([^}]*)\}/)?.[1] ?? '').toMatch(/flex-flow: row wrap/);
  });

  it('words the slope legend from its real maximum', () => {
    renderPanel({ slope: { visible: true, opacity: 0.8 } });
    const legend = screen.getByRole('figure', { name: 'Slope legend, °' });
    expect(legend).toHaveTextContent('Flat, safer to land 0°');
    expect(legend).toHaveTextContent('Steep, risky 27°');
  });

  it('says why a layer without values has no legend (a made-up empty file)', () => {
    renderPanel(
      { elevation: { visible: true, opacity: 0.8 } },
      { layers: withoutElevationValues(LAYERS) },
    );
    expect(screen.getByText(/^Legend unavailable:/)).toHaveTextContent(
      `Legend unavailable: ${NO_VALUES_REASON}`,
    );
  });

  it('says when a layer’s images failed, and never mentions memory or resolution', () => {
    renderPanel({ slope: { visible: true, opacity: 0.8 } }, { failedIds: ['slope'] });
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load the slope images');
    expect(screen.queryByText(/Preview resolution on this device|memory/)).toBeNull();
  });

  it('shows one readout line for every layer that is on, each with its status tag', () => {
    renderPanel(
      { slope: { visible: true, opacity: 0.8 }, elevation: { visible: true, opacity: 0.8 } },
      {
        readings: {
          elevation: { kind: 'value', value: 1234, unit: 'm', levelId: 'base', pixelM: 160 },
          slope: { kind: 'value', value: 19.45, unit: '°', levelId: 'base', pixelM: 160 },
        },
      },
    );
    expect(screen.queryByRole('group', { name: 'Readings from' })).toBeNull();
    expect(screen.getByTestId('readout-elevation')).toHaveTextContent(
      'Elevation +1.2 km · 160 mCalculated',
    );
    expect(screen.getByTestId('readout-slope')).toHaveTextContent('Slope 19.45° · 160 mCalculated');
    expect(screen.getByTestId('layer-readout')).toHaveAttribute('aria-live', 'polite');
    cleanup();
    // A layer that is off has no line; a reading that is not a value (no data) has none either.
    renderPanel(
      { slope: { visible: true, opacity: 0.8 } },
      {
        readings: {
          elevation: { kind: 'value', value: 5, unit: 'm', levelId: 'base', pixelM: 160 },
          slope: { kind: 'nodata', levelId: 'base', pixelM: 160 },
        },
      },
    );
    expect(screen.queryByTestId('layer-readout')).toBeNull();
    expect(screen.queryByText(/No data/)).toBeNull();
  });
});

describe.runIf(LAYERS.length > 0)('useLayerReading', () => {
  it('reads the layer at the point, and drops an answer for an older point', async () => {
    const slope = LAYERS.find((layer) => layer.id === 'slope');
    if (!slope) throw new Error('no slope layer');
    const read = vi.fn(async (_layer: unknown, point: { lat: number; lon: number }) =>
      point.lat > -80
        ? ({ kind: 'outside' } as const)
        : ({ kind: 'value', value: 0, unit: '°', levelId: 'base', pixelM: 160 } as const),
    );
    const { result, rerender } = renderHook(({ point }) => useLayerReading(slope, point, read), {
      initialProps: { point: { lat: -85, lon: 0 } },
    });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toMatchObject({ kind: 'value', value: 0 }));
    rerender({ point: { lat: -79, lon: 0 } });
    // Until the new answer arrives the last one stays: no flash back to the prompt.
    expect(result.current).toMatchObject({ kind: 'value', value: 0 });
    await waitFor(() => expect(result.current).toEqual({ kind: 'outside' }));
  });
});

describe.runIf(LAYERS.length > 0)('ElevationLine (the place card)', () => {
  it('names the layer in every reading, and says slope is not a pass/fail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => new Response('down', { status: 503 })),
    );
    render(<ElevationLine place={{ lat: -85, lon: 10 }} />);
    const line = screen.getByTestId('elevation-line');
    await waitFor(() => expect(line).toHaveTextContent('Slope: Couldn’t load this value'));
    await waitFor(() => expect(line).toHaveTextContent('Elevation: Couldn’t load this value'));
    expect(line).toHaveTextContent(
      'Slope: average over one pixel (160 m or 40 m), not a pass/fail.',
    );
    expect(line).not.toHaveTextContent(/Team raster|SRC-/);
    vi.unstubAllGlobals();
  });

  it('reads the manifest it is given, and names a layer without values', async () => {
    if (!MAP_LAYERS) throw new Error('no layers');
    render(
      <ElevationLine
        place={{ lat: -85, lon: 10 }}
        manifest={{ ...MAP_LAYERS, layers: withoutElevationValues(MAP_LAYERS.layers) }}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('elevation-line')).toHaveTextContent(
        `Elevation: Unavailable: ${NO_VALUES_REASON}`,
      ),
    );
    cleanup();
    render(<ElevationLine place={{ lat: -85, lon: 10 }} manifest={null} />);
    expect(screen.queryByTestId('elevation-line')).toBeNull();
  });
});
