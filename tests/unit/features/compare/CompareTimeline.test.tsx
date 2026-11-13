import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { DEFAULT_DEMO_MISSION, assessSky, type RankedSite } from '../../../../src/data/demoData';
import { CompareTimeline } from '../../../../src/features/compare/CompareTimeline';
import { ComparePanel } from '../../../../src/features/compare/ComparePanel';
import { findSite } from '../../../../src/services/sites';
import { DAY_MS } from '../../../../src/utils/time';

const DEC12 = Date.UTC(2026, 11, 12);
/** Picked dates 12 to 25 Dec 2026 (the range runs to 00:00 on 26 Dec). */
const RANGE = { start: DEC12, end: Date.UTC(2026, 11, 26) };
const NONE = () => null;

/** A real site with made-up hours (only the layout and the bracket are under test). */
function entry(id: string, sunHours: number): RankedSite {
  const site = findSite(id);
  if (!site) throw new Error(`no site ${id}`);
  const assessment = assessSky(
    {
      sunPct: 50,
      earthPct: 100,
      sunHours,
      earthHours: 336,
      bothHours: sunHours,
      longestSunlitDays: 10,
      longestWindowDays: 10,
      windows: [],
    },
    DEFAULT_DEMO_MISSION,
    RANGE,
  );
  return { site, assessment, rank: 1 };
}

const ENTRIES = [entry('bg1', 150), entry('im2', 90)];

function renderTimeline(onMove = vi.fn()) {
  render(
    <CompareTimeline
      entries={ENTRIES}
      mission={DEFAULT_DEMO_MISSION}
      range={RANGE}
      picked
      seriesFor={NONE}
      terrainFor={NONE}
      onMove={onMove}
    />,
  );
  return onMove;
}

describe('CompareTimeline (docs/LANDER_RULES.md, "Timeline")', () => {
  it('draws one row per site with its hours, what is up at the start, and a legend in words', () => {
    renderTimeline();
    const timeline = screen.getByTestId('compare-timeline');
    expect(timeline).toHaveTextContent('12 months from 12 Dec 2026');
    expect(
      within(screen.getByRole('list', { name: 'Legend' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Sun and Earth both up', 'Sun only', 'Earth only', 'Neither up']);
    const rows = within(screen.getByRole('list', { name: 'Sites on the timeline' })).getAllByRole(
      'listitem',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Blue Ghost Mission 1Sun 150 h · Earth 336 h · both 150 h');
    expect(rows[0]).toHaveTextContent(
      /At 12 Dec: (Sun and Earth both up|Sun only|Earth only|Neither up)/,
    );
    expect(rows[0]).toHaveTextContent('Positions: our engine (checked against JPL Horizons)');
    // What "up" means, with this mission's minimums.
    expect(timeline).toHaveTextContent(
      'Up = at least 5° (Sun) / 5° (Earth), this DEMO mission’s minimums, and above the terrain where known.',
    );
    expect(timeline).toHaveTextContent('Dates checked: 12 Dec 2026 to 25 Dec 2026 (UTC).');
    expect(screen.getAllByRole('img', { name: /what is up over the 12 months$/ })).toHaveLength(2);
  });

  it('gives every bar its dates and state as text on hover', () => {
    renderTimeline();
    const bars = screen.getByTestId('compare-timeline').querySelectorAll('[data-state]');
    expect(bars.length).toBeGreaterThan(0);
    for (const bar of bars) {
      expect(bar.getAttribute('title')).toMatch(
        /^\d+ \w+ \d{4} · \d\d:\d\d UTC to \d+ \w+ \d{4} · \d\d:\d\d UTC \(6-hour steps\): (Sun and Earth both up|Sun only|Earth only)$/,
      );
    }
  });

  it('moves the dates a day at a time with the arrow keys, and never before the start', () => {
    const onMove = renderTimeline();
    const bracket = screen.getByRole('slider', { name: 'Dates checked' });
    // The dates and each site's state at the start, for screen readers.
    expect(bracket.getAttribute('aria-valuetext')).toMatch(
      /^12 Dec 2026 to 25 Dec 2026 \(UTC\); Blue Ghost Mission 1: [^;]+; IM-2 Athena: [^;]+$/,
    );
    expect(bracket).toHaveAttribute('aria-valuenow', '0');
    fireEvent.keyDown(bracket, { key: 'ArrowRight' });
    expect(onMove).toHaveBeenLastCalledWith({
      startMs: DEC12 + DAY_MS,
      stopMs: Date.UTC(2026, 11, 26),
    });
    fireEvent.keyDown(bracket, { key: 'PageUp' });
    expect(onMove).toHaveBeenLastCalledWith({
      startMs: DEC12 + 7 * DAY_MS,
      stopMs: Date.UTC(2027, 0, 1),
    });
    // Already at the start of the 12 months: Left changes nothing.
    onMove.mockClear();
    fireEvent.keyDown(bracket, { key: 'ArrowLeft' });
    expect(onMove).not.toHaveBeenCalled();
    // End: the last 14 days of the 12 months.
    fireEvent.keyDown(bracket, { key: 'End' });
    expect(onMove).toHaveBeenLastCalledWith({
      startMs: Date.UTC(2027, 11, 12) - 14 * DAY_MS,
      stopMs: Date.UTC(2027, 11, 11),
    });
  });
});

describe('ComparePanel: the Timeline tab', () => {
  it('switches between the table and the Timeline', () => {
    render(
      <ComparePanel
        id="compare"
        entries={ENTRIES}
        mission={DEFAULT_DEMO_MISSION}
        time={RANGE.start}
        range={RANGE}
        compareMax={4}
        onRemove={() => undefined}
        onClear={() => undefined}
        onClose={() => undefined}
        onSelectSite={() => undefined}
        timeline={{
          seriesFor: NONE,
          terrainFor: NONE,
          range: RANGE,
          picked: true,
          onMove: () => undefined,
        }}
      />,
    );
    const tabs = screen.getByRole('tablist', { name: 'Compare view' });
    expect(within(tabs).getByRole('tab', { name: 'Table' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
    fireEvent.click(within(tabs).getByRole('tab', { name: 'Timeline' }));
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('tabpanel')).toContainElement(screen.getByTestId('compare-timeline'));
    fireEvent.keyDown(within(tabs).getByRole('tab', { name: 'Timeline' }), { key: 'ArrowLeft' });
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});

describe('CompareTimeline before any dates are picked', () => {
  it('shows the time bar’s real 29.5 days, and says moving the bracket picks whole days', () => {
    const start = Date.UTC(2026, 9, 30, 18);
    const range = { start, end: start + 29.5 * DAY_MS };
    render(
      <CompareTimeline
        entries={ENTRIES}
        mission={DEFAULT_DEMO_MISSION}
        range={range}
        picked={false}
        seriesFor={NONE}
        terrainFor={NONE}
        onMove={vi.fn()}
      />,
    );
    expect(screen.getByTestId('compare-timeline')).toHaveTextContent(
      'Dates checked: the time bar’s 29.5 days (30 Oct 18:00 to 29 Nov 06:00 UTC). Moving the bracket picks 30 whole days.',
    );
    expect(
      screen.getByRole('slider', { name: 'Dates checked' }).getAttribute('aria-valuetext'),
    ).toMatch(/^the time bar’s 29\.5 days \(30 Oct 18:00 to 29 Nov 06:00 UTC\); /);
  });
});
