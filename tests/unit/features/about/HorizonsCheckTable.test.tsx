import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { HorizonsCheckTable } from '../../../../src/features/about/HorizonsCheckTable';
import { HORIZONS_CHECK, readHorizonsCheck } from '../../../../src/features/about/horizonsCheck';

describe('readHorizonsCheck', () => {
  it('reads the generated file, and nothing in another shape', () => {
    expect(HORIZONS_CHECK?.limitDeg).toBe(0.2);
    expect(readHorizonsCheck(null)).toBeNull();
    expect(readHorizonsCheck({ version: 2 })).toBeNull();
    expect(
      readHorizonsCheck({ ...HORIZONS_CHECK, version: 1, engine: [{ site: 'im1' }] }),
    ).toBeNull();
  });
});

describe('HorizonsCheckTable', () => {
  it('shows the three checks from src/data/horizonsCheck.json, each row with its result', () => {
    const check = HORIZONS_CHECK;
    if (!check) throw new Error('no generated check');
    render(<HorizonsCheckTable />);
    const section = screen.getByRole('region', { name: 'Checked against JPL Horizons' });
    expect(section).toHaveTextContent('docs/HORIZONS_CHECK.md');
    expect(section).toHaveTextContent('Generated 13 Nov 2026');
    const [engine, flags, elevations] = within(section).getAllByRole('table');
    if (!engine || !flags || !elevations) throw new Error('three tables expected');

    // (a) one row per site and body, plus the header.
    expect(within(engine).getAllByRole('row')).toHaveLength(check.engine.length + 1);
    const first = check.engine[0];
    if (!first) throw new Error('no engine rows');
    expect(within(engine).getAllByRole('row')[1]).toHaveTextContent(
      `IM-1 OdysseusSun${first.maxDiffDeg.toFixed(4)}°${first.meanDiffDeg.toFixed(4)}°Pass`,
    );
    // (b) the flags, with the near-horizon rows listed and not judged, and why.
    expect(
      within(flags)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['File', 'Compared', 'Agree', 'Disagree', 'Near the horizon (not judged)', 'Result']);
    expect(within(flags).getAllByRole('row')).toHaveLength(check.flags.length + 1);
    expect(section).toHaveTextContent('upper limb');
    expect(section).toHaveTextContent('within 1° of the horizon are listed and not judged');
    expect(section).toHaveTextContent('The 1° margin is a team assumption');
    // (c) the elevation columns.
    expect(within(elevations).getAllByRole('row')).toHaveLength(check.elevations.length + 1);
    expect(within(elevations).getAllByRole('cell', { name: 'Pass' })).toHaveLength(
      check.elevations.length,
    );
  });

  it('shows nothing when there is no generated check', () => {
    const { container } = render(<HorizonsCheckTable check={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
