import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { NightSurvival } from '../../../../src/features/lunar-map/NightSurvival';
import { findLander } from '../../../../src/services/landers';

/** Renders the block for a lander with this darkness, opened. */
function renderBlock(landerId: string, hours: number, atLeast = false) {
  render(<NightSurvival lander={findLander(landerId)} dark={{ hours, atLeast }} />);
  fireEvent.click(screen.getByRole('button', { name: /^Night survival/ }));
  return screen.getByTestId('night-survival');
}

const verdict = (block: HTMLElement) => within(block).getByTestId('night-verdict');

describe('NightSurvival (docs/LANDER_RULES.md, "Lander night survival")', () => {
  it('says Nova-C survives 10 h of darkness: its battery lasts 15.5 h', () => {
    const block = renderBlock('nova-c', 10);
    expect(verdict(block)).toHaveTextContent('Survives the 10 h night');
  });

  it('says Nova-C does not survive 43 h, "at least" when the darkness reaches the range’s edge', () => {
    const block = renderBlock('nova-c', 43, true);
    expect(verdict(block)).toHaveTextContent(
      'Does not survive: battery lasts 15.5 h, night is at least 43 h',
    );
  });

  it('shows five short rows, value and tag only', () => {
    const block = renderBlock('nova-c', 10);
    const rows = within(block).getAllByRole('definition');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Nova-C (IM-1, IM-2)',
      '788 WS',
      '1,554 WhS',
      '100 WA',
      '15.5 h',
    ]);
    // No long notes, no legend, no links: those are on the About page.
    expect(block).not.toHaveTextContent(/conflict|disagree|200 W|700 Wh|Tags:/);
    expect(within(block).queryByRole('link')).toBeNull();
  });

  it('gives a tag a one-line source on hover', () => {
    const block = renderBlock('nova-c', 10);
    expect(within(block).getByText('A').parentElement).toHaveAttribute(
      'title',
      expect.stringContaining('team assumption'),
    );
  });

  it.each(['blue-ghost-1', 'griffin-1', 'chandrayaan-3'])(
    "can't judge %s: its battery or night load is not published",
    (id) => {
      const block = renderBlock(id, 10);
      expect(verdict(block)).toHaveTextContent("Can't judge: battery or night load not published");
    },
  );

  it("can't judge Nova-C when its battery outlasts darkness cut by the dates checked", () => {
    const block = renderBlock('nova-c', 10, true);
    expect(verdict(block)).toHaveTextContent("Can't judge: the night runs past the dates checked");
    expect(verdict(block)).not.toHaveTextContent('Survives');
  });

  it('never says "Survives" when there is no night in the dates', () => {
    const block = renderBlock('nova-c', 0);
    expect(verdict(block)).toHaveTextContent("No night in these dates: can't judge");
    expect(verdict(block)).not.toHaveTextContent('Survives');
  });
});
