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
  it('renders no assistant box or examples; the mission form still works', () => {
    render(<App />);
    fireEvent.click(railItem('Mission'));
    const mission = screen.getByRole('region', { name: 'Mission' });
    expect(within(mission).queryByRole('region', { name: 'Launch slipped?' })).toBeNull();
    expect(within(mission).queryByRole('group', { name: 'Examples to try' })).toBeNull();
    expect(within(mission).queryByText(/Launch slipped/)).toBeNull();

    fireEvent.click(within(mission).getByRole('button', { name: 'Add your own mission' }));
    const form = screen.getByRole('region', { name: 'Add your own mission' });
    fireEvent.change(within(form).getByRole('textbox', { name: 'Name' }), {
      target: { value: 'By hand' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Use without saving' }));
    // The form closes back to the Mission view, with the new mission picked.
    expect(
      within(screen.getByRole('combobox', { name: 'Mission' })).getByRole('option', {
        selected: true,
      }),
    ).toHaveTextContent('By hand · Custom');
  });

  it('keeps the dates to check and the Delay buttons working without it', () => {
    render(<App />);
    fireEvent.click(railItem('Mission'));
    const dates = within(screen.getByRole('region', { name: 'Mission' })).getByRole('region', {
      name: 'Dates to check',
    });
    fireEvent.change(within(dates).getByLabelText('Start (UTC)'), {
      target: { value: '2026-12-12' },
    });
    fireEvent.change(within(dates).getByLabelText('Stop (UTC)'), {
      target: { value: '2026-12-25' },
    });
    expect(dates).toHaveTextContent('Checking 12 Dec 2026 to 25 Dec 2026 (UTC)');
    fireEvent.click(within(dates).getByRole('button', { name: 'Delay 1 week' }));
    expect(dates).toHaveTextContent('Checking 19 Dec 2026 to 1 Jan 2027 (UTC)');
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
