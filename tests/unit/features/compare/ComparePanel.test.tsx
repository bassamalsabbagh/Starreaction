import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { DEFAULT_DEMO_MISSION, assessSky, type RankedSite } from '../../../../src/data/demoData';
import { ComparePanel } from '../../../../src/features/compare/ComparePanel';
import { findSite } from '../../../../src/services/sites';
import { RANGE_MS } from '../../../../src/utils/time';

const RANGE = { start: Date.UTC(2026, 10, 1), end: Date.UTC(2026, 10, 1) + RANGE_MS };

/** A real site with a made-up sky (only the "Best" marks are under test). */
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

function renderPanel(entries: readonly RankedSite[]) {
  render(
    <ComparePanel
      id="compare"
      entries={entries}
      mission={DEFAULT_DEMO_MISSION}
      time={RANGE.start}
      range={RANGE}
      compareMax={4}
      onRemove={() => undefined}
      onClear={() => undefined}
      onClose={() => undefined}
      onSelectSite={() => undefined}
    />,
  );
  return screen.getByRole('table');
}

/** The columns marked "Best" in a row, by site name. */
function bestIn(table: HTMLElement, row: RegExp): string[] {
  const names = within(table)
    .getAllByRole('columnheader')
    .map((cell) => cell.textContent?.replace(/Remove$/, '') ?? '');
  const cells = within(within(table).getByRole('row', { name: row })).getAllByRole('cell');
  return cells.flatMap((cell, index) =>
    cell.textContent?.includes('Best') ? [names[index] ?? ''] : [],
  );
}

describe('ComparePanel: "Best"', () => {
  it('breaks a tie on the usable window by name, as the Sites list does', () => {
    // Listed IM-2 first: the tie still goes to Blue Ghost Mission 1, first by name.
    const table = renderPanel([entry('im2', 10, 300), entry('bg1', 10, 300)]);
    expect(bestIn(table, /^Usable window/)).toEqual(['Blue Ghost Mission 1']);
  });

  it('marks one best by name when the top values tie, and none when every site ties', () => {
    const table = renderPanel([entry('im2', 12, 400), entry('ch3', 10, 400), entry('im1', 8, 300)]);
    expect(bestIn(table, /^Hours of Sun/)).toEqual(['Chandrayaan-3 Vikram']);
    // Every site has 708 h of Earth: nothing to pick between.
    expect(bestIn(table, /^Hours of Earth/)).toEqual([]);
    expect(bestIn(table, /^Usable window/)).toEqual(['IM-2 Athena']);
  });
});
