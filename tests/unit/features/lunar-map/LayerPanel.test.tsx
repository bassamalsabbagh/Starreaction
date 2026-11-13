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
    activeId?: string | null;
    reading?: LayerReading | null;
    previewOnly?: boolean;
    failedIds?: string[];
  } = {},
) {
  const props = {
    onToggle: vi.fn(),
    onOpacity: vi.fn(),
    onActive: vi.fn(),
    onClose: vi.fn(),
  };
  render(
    <LayerPanel
      layers={options.layers ?? LAYERS}
      settings={settings}
      activeId={options.activeId ?? null}
      reading={options.reading ?? null}
      sourceId="SRC-073"
      previewOnly={options.previewOnly}
      failedIds={options.failedIds}
      {...props}
    />,
  );
  return props;
}

describe.runIf(LAYERS.length > 0)('LayerPanel', () => {
  it('has a switch and an opacity slider for every layer', () => {
    const props = renderPanel({});
    fireEvent.click(screen.getByRole('checkbox', { name: 'Slope' }));
    expect(props.onToggle).toHaveBeenCalledWith('slope');
    fireEvent.change(screen.getByRole('slider', { name: 'Elevation opacity' }), {
      target: { value: '40' },
    });
    expect(props.onOpacity).toHaveBeenCalledWith('elevation', 0.4);
    expect(screen.getByRole('checkbox', { name: 'Elevation' })).not.toBeChecked();
    // Nothing is switched on: no legend, no readings selector.
    expect(screen.queryByRole('figure')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Readings from' })).toBeNull();
  });

  it('shows the slope legend in degrees and the elevation legend in metres', () => {
    renderPanel({
      slope: { visible: true, opacity: 0.8 },
      elevation: { visible: true, opacity: 0.6 },
    });
    const legend = screen.getByRole('figure', { name: 'Slope legend, °' });
    expect(legend).toHaveTextContent('Slope (°)');
    expect(legend).toHaveTextContent(/^0.*/);
    const elevation = screen.getByRole('figure', { name: 'Elevation legend, m' });
    expect(elevation).toHaveTextContent('Elevation (m)');
    // Labels at the stored precision (whole metres), negative and positive.
    expect(elevation).toHaveTextContent('-7000');
    expect(elevation).toHaveTextContent(/7026Elevation \(m\)$/);
    expect(screen.queryByText(/Legend unavailable/)).toBeNull();
    expect(screen.getByRole('slider', { name: 'Elevation opacity' })).toHaveValue('60');
    expect(
      screen.getByText('Slope: average over one pixel (160 m or 40 m), not a pass/fail.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Team raster \(SRC-073; origin to be recorded\)/)).toBeInTheDocument();
    expect(
      screen.getByText(
        '160 m readings are the mean of 16 pixels and can differ from the colour under the cursor.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Preview resolution on this device/)).toBeNull();
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

  it('says when a layer’s images failed, and when only previews are drawn on this device', () => {
    renderPanel(
      { slope: { visible: true, opacity: 0.8 } },
      { previewOnly: true, failedIds: ['slope'] },
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load the layer images');
    expect(screen.getByText(/^Preview resolution on this device/)).toBeInTheDocument();
  });

  it('chooses the layer readings come from, and reads a value with its status', () => {
    const props = renderPanel(
      { slope: { visible: true, opacity: 0.8 }, elevation: { visible: true, opacity: 0.8 } },
      {
        activeId: 'slope',
        reading: { kind: 'value', value: 12.28, unit: '°', levelId: 'im1', pixelM: 40 },
      },
    );
    const group = screen.getByRole('group', { name: 'Readings from' });
    expect(within(group).getByRole('radio', { name: 'Slope' })).toBeChecked();
    fireEvent.click(within(group).getByRole('radio', { name: 'Elevation' }));
    expect(props.onActive).toHaveBeenCalledWith('elevation');
    const readout = screen.getByTestId('layer-readout');
    expect(readout).toHaveAttribute('aria-live', 'polite');
    expect(readout).toHaveTextContent('Slope 12.28° · 40 mReal data');
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
    expect(line).toHaveTextContent('Team raster (SRC-073; origin to be recorded)');
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
