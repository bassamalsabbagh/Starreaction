import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { App } from '../../src/app/App';

// In a file of its own: the flag is read once, when the app's modules load. Here it is left as
// built, with VITE_SLIP_ASSISTANT unset: the assistant is off by default (a future plan). The
// switched-on assistant is covered in App.test.tsx.
vi.mock('../../src/features/lunar-map/useHorizonsSeries', () => {
  const none = { series: new Map(), settled: false };
  return { useHorizonsSeries: () => none };
});
vi.mock('../../src/features/lunar-map/MoonGlobe', () => import('../mocks/MoonGlobe'));
beforeAll(async () => {
  await import('../mocks/MoonGlobe');
});

function railItem(name: string) {
  return within(screen.getByRole('navigation', { name: 'Menu' })).getByRole('button', {
    name: new RegExp(`^${name}(, \\d+ picked)?$`),
  });
}

describe('App as built: the "Launch slipped?" assistant is off by default', () => {
  it('renders no assistant box or examples anywhere in the plan', () => {
    render(<App />);
    expect(screen.queryByRole('region', { name: 'Launch slipped?' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Examples to try' })).toBeNull();
    expect(screen.queryByText(/Launch slipped/)).toBeNull();
  });

  it('leaves the assistant out of About: no guide line, no AI notice', () => {
    render(<App />);
    fireEvent.click(railItem('About'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByTestId('ai-notice')).toBeNull();
    expect(within(dialog).queryByText('Launch slipped?')).toBeNull();
    // The roadmap keeps it, as a future plan, never as built.
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Roadmap' }));
    const roadmap = within(dialog).getByRole('tabpanel');
    expect(roadmap).toHaveTextContent(/Planned\s*Launch slipped\?.*future plan/);
    expect(roadmap).not.toHaveTextContent(/Done\s*Launch slipped/);
  });
});
