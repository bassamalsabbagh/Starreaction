import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { DEFAULT_DEMO_MISSION, assessSky, type RankedSite } from '../../../../src/data/demoData';
import { bestTiles } from '../../../../src/features/compare/bestTiles';
import { CompareFull } from '../../../../src/features/compare/CompareFull';
import { ComparePanel } from '../../../../src/features/compare/ComparePanel';
import { findSite } from '../../../../src/services/sites';
import { RANGE_MS } from '../../../../src/utils/time';

const RANGE = { start: Date.UTC(2026, 10, 1), end: Date.UTC(2026, 10, 1) + RANGE_MS };

/** A real site with a made-up sky (only the cards, marks and wording are under test). */
function entry(id: string, usableDays: number, sunHours: number): RankedSite {
  const site = findSite(id);
  if (!site) throw new Error(`no site ${id}`);
  const assessment = assessSky(
    {
      sunPct: 50,
      earthPct: 100,
      sunHours,
      earthHours: 708,
      bothHours: sunHours,
      longestSunlitDays: usableDays,
      longestWindowDays: usableDays,
      windows: [],
    },
    DEFAULT_DEMO_MISSION,
    RANGE,
  );
  return { site, assessment, rank: 1 };
}

const THREE = [entry('im2', 12, 400), entry('ch3', 10, 400), entry('im1', 8, 300)];

function renderPanel(
  entries: readonly RankedSite[],
  handlers: Partial<{ onRemove: (id: string) => void; onFull: () => void }> = {},
) {
  render(
    <ComparePanel
      id="compare"
      entries={entries}
      mission={DEFAULT_DEMO_MISSION}
      compareMax={4}
      onRemove={handlers.onRemove ?? (() => undefined)}
      onClear={() => undefined}
      onClose={() => undefined}
      onSelectSite={() => undefined}
      onFull={handlers.onFull ?? (() => undefined)}
      fullOpen={false}
    />,
  );
}

describe('bestTiles: the winner of each card row', () => {
  it('marks one by name when the top values tie, and none when every place ties', () => {
    const winners = bestTiles(THREE);
    // 400 h, 400 h, 300 h: the tie at the top goes to Chandrayaan-3, first by name.
    expect([...(winners.get('sun') ?? [])]).toEqual(['ch3']);
    expect([...(winners.get('both') ?? [])]).toEqual(['ch3']);
    // Every place has 708 h of Earth: nothing to pick between.
    expect([...(winners.get('earth') ?? [])]).toEqual([]);
  });

  it('marks nobody with fewer than two places that pass', () => {
    expect([...(bestTiles([entry('im2', 12, 400)]).get('sun') ?? [])]).toEqual([]);
  });
});

describe('ComparePanel (compact, no table)', () => {
  it('says which is best in one line, the key parts in bold', () => {
    renderPanel(THREE);
    const line = screen.getByTestId('compare-verdict');
    expect(line).toHaveTextContent(
      'Best: Chandrayaan-3 Vikram: 16.7 days Sun + Earth together vs 16.7 days.',
    );
    expect(Array.from(line.querySelectorAll('strong')).map((node) => node.textContent)).toEqual([
      'Chandrayaan-3 Vikram',
      '16.7 days',
      '16.7 days',
    ]);
  });

  it('has one card per place with the three Results tiles in days, and Best on the winner', () => {
    renderPanel(THREE);
    // The cards themselves (each holds its tiles, which are list items too).
    const cards = Array.from(
      screen.getByRole('list', { name: 'Compared locations' }).children,
    ) as HTMLElement[];
    expect(cards).toHaveLength(3);
    const card = cards.find((item) => item.textContent?.includes('Chandrayaan-3'));
    if (!card) throw new Error('no card');
    for (const label of ['Sun up', 'Earth in view', 'Sun + Earth together']) {
      expect(within(card).getByText(label)).toBeInTheDocument();
    }
    expect(card).toHaveTextContent(/16\.7 days/);
    expect(card).toHaveTextContent('Pass');
    // Best on Sun up and on Sun + Earth together (not on Earth in view: a tie).
    expect(within(card).getAllByText('Best')).toHaveLength(2);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Timeline' })).toBeNull();
  });

  it('removes a place from its card, and opens the full comparison from its button', () => {
    const onRemove = vi.fn();
    const onFull = vi.fn();
    renderPanel(THREE, { onRemove, onFull });
    fireEvent.click(screen.getByRole('button', { name: 'Remove IM-1 Odysseus' }));
    expect(onRemove).toHaveBeenCalledWith('im1');
    fireEvent.click(screen.getByRole('button', { name: 'Full comparison ›' }));
    expect(onFull).toHaveBeenCalledOnce();
  });

  it('asks for a second place when there is only one', () => {
    renderPanel([entry('im2', 12, 400)]);
    expect(screen.getByText('Nothing to compare yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Full comparison ›' })).toBeNull();
  });
});

describe('CompareFull (the table beside the panel)', () => {
  it('uses the days wording of Results, with Best, and closes with its X', () => {
    const onClose = vi.fn();
    render(
      <CompareFull
        id="full"
        entries={THREE}
        mission={DEFAULT_DEMO_MISSION}
        range={RANGE}
        onClose={onClose}
        onSelectSite={() => undefined}
      />,
    );
    const table = screen.getByRole('table');
    for (const label of [/^Sun up/, /^Earth in view/, /^Sun \+ Earth together/]) {
      expect(within(table).getByRole('row', { name: label })).toBeInTheDocument();
    }
    // The old wording is gone: heights, percentages of the dates, hours.
    expect(table).not.toHaveTextContent(/Sun at least|Earth at least|of these dates|Hours of/);
    const sunRow = within(table).getByRole('row', { name: /^Sun up/ });
    expect(sunRow).toHaveTextContent('16.7 days');
    expect(within(sunRow).getAllByText('Best')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close full comparison' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
