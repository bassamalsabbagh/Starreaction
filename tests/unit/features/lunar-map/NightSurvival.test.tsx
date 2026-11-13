import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { NightSurvival } from '../../../../src/features/lunar-map/NightSurvival';
import { LANDER_FIELDS, findLander } from '../../../../src/services/landers';

/** Renders the block for a lander with this darkness, opened. */
function renderBlock(landerId: string, hours: number, atLeast = false) {
  render(
    <NightSurvival
      lander={findLander(landerId)}
      dark={{ hours, atLeast }}
      loadW={20}
      within="in this month"
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Night survival' }));
  return screen.getByTestId('night-survival');
}

describe('NightSurvival (docs/LANDER_RULES.md, "Lander night survival")', () => {
  it('says Nova-C survives 10 h of darkness: its battery lasts 15.5 h', () => {
    const block = renderBlock('nova-c', 10);
    expect(within(block).getByTestId('night-verdict')).toHaveTextContent(
      'Survives battery lasts 15.5 h (1554 Wh ÷ 100 W night load (A: team assumption)) vs longest darkness 10 h',
    );
  });

  it('says Nova-C doesn’t survive 43 h, "at least" when the darkness reaches the range’s edge', () => {
    const block = renderBlock('nova-c', 43, true);
    expect(within(block).getByTestId('night-verdict')).toHaveTextContent(
      'Doesn’t survive battery lasts 15.5 h (1554 Wh ÷ 100 W night load (A: team assumption)) vs longest darkness at least 43 h',
    );
    expect(block).toHaveTextContent(
      'Battery needed here: at least 860 Wh (at least 6.1 kg at 143 Wh/kg), for your 20 W night load (set in Power details)',
    );
  });

  it.each(['blue-ghost-1', 'griffin-1', 'chandrayaan-3'])(
    "can't judge %s: its battery or night load is not published",
    (id) => {
      const block = renderBlock(id, 10);
      expect(within(block).getByTestId('night-verdict')).toHaveTextContent(
        /^Can't judge: not published Missing: .*(Battery|Night load \(heater \+ electronics\))/,
      );
    },
  );

  it("can't judge Nova-C when its battery outlasts darkness cut by the dates checked", () => {
    const block = renderBlock('nova-c', 10, true);
    expect(within(block).getByTestId('night-verdict')).toHaveTextContent(
      "Can't judge: the night runs past the dates checked battery lasts 15.5 h (1554 Wh ÷ 100 W night load (A: team assumption)) vs at least 10 h of darkness seen",
    );
    expect(within(block).getByTestId('night-verdict')).not.toHaveTextContent('Survives');
  });

  it('labels the night load as heater plus electronics, never "Heater"', () => {
    const block = renderBlock('nova-c', 10);
    expect(block).toHaveTextContent('Night load (heater + electronics)100 W');
    expect(block.textContent).not.toContain('Heater');
  });

  it('shows the lander, all five values and a tag next to every value', () => {
    const block = renderBlock('nova-c', 10);
    expect(block).toHaveTextContent('Nova-C (IM-1, IM-2)');
    const rows = within(block).getAllByRole('definition');
    expect(rows).toHaveLength(LANDER_FIELDS.length);
    // Solar power S, battery S, night load A, panel area and slope not published (the slope with
    // its note that the sources disagree).
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringMatching(/^788 WSsource/),
      expect.stringMatching(/^1,554 WhSsource/),
      '100 WA',
      'not published',
      expect.stringMatching(/^not published.*disagree/),
    ]);
    const source = within(block).getByRole('link', {
      name: 'Source of the Battery (opens in a new tab)',
    });
    expect(source).toHaveAttribute('target', '_blank');
    expect(source).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('shows both conflict notes next to their values: 788 W vs 200 W, 1554 Wh vs 700 Wh', () => {
    const block = renderBlock('nova-c', 10);
    const [solar, battery] = within(block).getAllByRole('definition');
    expect(solar).toHaveTextContent('788 W');
    expect(solar).toHaveTextContent('200 W');
    expect(battery).toHaveTextContent('700 Wh');
  });

  it('gives Chandrayaan-3’s touchdown slope as information only, with its source', () => {
    const block = renderBlock('chandrayaan-3', 10);
    expect(block).toHaveTextContent(
      'Lander spec: touchdown slope up to 12° (S) source. Information only, not a check.',
    );
    expect(
      within(block).getByRole('link', {
        name: 'Source of the touchdown slope spec (opens in a new tab)',
      }),
    ).toHaveAttribute('href', 'https://www.isro.gov.in/Chandrayaan3_Details.html');
  });
});
