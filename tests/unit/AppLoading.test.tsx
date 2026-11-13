import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '../../src/app/App';

// In a file of its own: Vitest gives each test file fresh modules, so the lazy-loaded globe is
// certainly not loaded yet when this test starts (in App.test.tsx an earlier test may have loaded
// it, and then there is no loading message to see).
vi.mock('../../src/features/lunar-map/MoonGlobe', () => import('../mocks/MoonGlobe'));

// Load the stand-in once up front: its first import sometimes stalled when the whole suite ran at
// once. The app still shows its loading message on the first render (React waits for the import
// promise either way).
beforeAll(async () => {
  await import('../mocks/MoonGlobe');
});

describe('App loading', () => {
  it('shows a loading message while the lazy-loaded globe arrives', async () => {
    render(<App />);
    expect(screen.getByText('Loading the lunar map…')).toBeInTheDocument();
    // The first, cold load can take several seconds when the whole suite runs at once.
    await screen.findByTestId('moon-globe', {}, { timeout: 15_000 });
    expect(screen.queryByText('Loading the lunar map…')).not.toBeInTheDocument();
  });
});
