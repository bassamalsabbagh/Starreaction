import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { MapErrorBoundary } from '../../../../src/features/lunar-map/MapErrorBoundary';

function FailsOnStart(): null {
  // Like CesiumWidget without WebGL: it throws while the map starts up.
  useEffect(() => {
    throw new Error('WebGL is not supported');
  }, []);
  return null;
}

describe('MapErrorBoundary', () => {
  it('shows its children while the map works', () => {
    render(
      <MapErrorBoundary>
        <p>The Moon</p>
      </MapErrorBoundary>,
    );
    expect(screen.getByText('The Moon')).toBeInTheDocument();
  });

  it('replaces only the map with a note when it fails to start', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <div>
        <p>The panels</p>
        <MapErrorBoundary>
          <FailsOnStart />
        </MapErrorBoundary>
      </div>,
    );
    expect(screen.getByText('The panels')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'The 3D Moon couldn’t start in this browser.',
    );
    expect(screen.getByRole('status')).toHaveTextContent('Everything else still works');
    quiet.mockRestore();
  });
});
