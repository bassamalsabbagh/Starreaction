import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MapControls } from '../../../../src/features/lunar-map/MapControls';

function renderControls(onToggleLayers?: () => void, layersOpen = false) {
  render(
    <MapControls
      onZoomIn={() => undefined}
      onZoomOut={() => undefined}
      onWholeMoon={() => undefined}
      showGrid={false}
      onShowGridChange={() => undefined}
      onToggleLayers={onToggleLayers}
      layersOpen={layersOpen}
    />,
  );
}

describe('MapControls', () => {
  it('has one "Map layers" button in place of the old Elevation and Slope buttons', () => {
    const onToggle = vi.fn();
    renderControls(onToggle, true);
    expect(screen.queryByRole('button', { name: 'Elevation' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Slope' })).toBeNull();
    const layers = screen.getByRole('button', { name: 'Map layers' });
    expect(layers).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(layers);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('shows no disabled placeholder, and no layers button without layers', () => {
    renderControls();
    expect(screen.queryByRole('button', { name: 'Map layers' })).toBeNull();
    for (const button of screen.getAllByRole('button')) {
      expect(button).not.toHaveAttribute('aria-disabled');
    }
  });

  it('offers Top and 3D views of the south pole, the current one pressed', () => {
    const onPoleMode = vi.fn();
    render(
      <MapControls
        onZoomIn={() => undefined}
        onZoomOut={() => undefined}
        onWholeMoon={() => undefined}
        showGrid={false}
        onShowGridChange={() => undefined}
        poleMode="top"
        onPoleMode={onPoleMode}
      />,
    );
    expect(screen.getByRole('button', { name: 'Top' })).toHaveAttribute('aria-pressed', 'true');
    const tilted = screen.getByRole('button', { name: '3D' });
    expect(tilted).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(tilted);
    expect(onPoleMode).toHaveBeenCalledWith('3d');
  });
});
