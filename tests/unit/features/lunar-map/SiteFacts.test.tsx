import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SiteFacts } from '../../../../src/features/lunar-map/SiteFacts';
import type { Site } from '../../../../src/services/sites';

/** A made-up site record for these tests only (not a real landing). */
function site(overrides: Partial<Site> = {}): Site {
  const record: Site = {
    id: 'test',
    name: 'Test Site',
    region: 'Test region',
    lat: -84.79,
    lon: 29.2,
    coordSource: 'TODO (team)',
    coordNote: null,
    sourceIds: [],
    landerId: 'test-lander',
    landingDateUtc: '2025-03-06',
    landingDateSource: 'TODO (team)',
    landingOutcome: 'Landed on its side',
    landingOutcomeSource: 'TODO (team)',
    missionOutcome: 'Ended early',
    missionOutcomeSource: 'TODO (team)',
    why: 'Made up for this test.',
  };
  return { ...record, ...overrides };
}

/** The value next to a label in the record. */
function field(name: string): HTMLElement {
  const term = within(screen.getByRole('group', { name: 'The landing' })).getByText(name, {
    selector: 'dt',
  });
  const value = term.nextElementSibling;
  if (!(value instanceof HTMLElement)) throw new Error(`no value for ${name}`);
  return value;
}

describe('SiteFacts', () => {
  it('shows the why line, the coordinates, the landing date and both outcomes, separately', () => {
    render(<SiteFacts site={site()} />);
    // The why line is a team note, and says so.
    expect(screen.getByRole('group', { name: 'The landing' })).toHaveTextContent(
      'Why it’s here (team note): Made up for this test.',
    );
    expect(field('Coordinates')).toHaveTextContent(/^84\.79° S, 29\.2° E/);
    expect(field('Landed')).toHaveTextContent('6 Mar 2025 (UTC)');
    // Haversine to the pole (R = 1737.4 km): 5.21° of latitude.
    expect(field('From the south pole')).toHaveTextContent('158.0 kmCalculated');
    expect(field('Landing outcome')).toHaveTextContent('Landed on its side');
    expect(field('Mission outcome')).toHaveTextContent('Ended early');
    expect(field('Landing outcome')).not.toHaveTextContent('Ended early');
  });

  it('tags each value "source TODO" while its own source is a TODO', () => {
    render(<SiteFacts site={site()} />);
    expect(field('Coordinates')).toHaveTextContent('source TODO');
    expect(field('Landing outcome')).toHaveTextContent('source TODO');
    expect(field('Mission outcome')).toHaveTextContent('source TODO');
  });

  it('leaves sourced values untagged, one outcome at a time, and shows a note on the coordinates', () => {
    render(
      <SiteFacts
        site={site({
          coordSource: 'https://example.org/coordinates',
          coordNote: 'Planned target, not a measured point',
          landingOutcomeSource: 'https://example.org/landing',
        })}
      />,
    );
    expect(field('Coordinates')).not.toHaveTextContent('source TODO');
    expect(field('Coordinates')).toHaveTextContent('Planned target, not a measured point');
    expect(field('Landing outcome')).not.toHaveTextContent('source TODO');
    expect(field('Mission outcome')).toHaveTextContent('source TODO');
  });

  it('links each sourced value to its own source, in a new tab', () => {
    render(
      <SiteFacts
        site={site({
          coordSource: 'https://example.org/coordinates',
          landingDateSource: 'https://example.org/date',
          landingOutcomeSource: 'https://example.org/landing',
          missionOutcomeSource: 'https://example.org/mission',
        })}
      />,
    );
    for (const [what, url] of [
      ['coordinates', 'https://example.org/coordinates'],
      ['landing date', 'https://example.org/date'],
      ['landing outcome', 'https://example.org/landing'],
      ['mission outcome', 'https://example.org/mission'],
    ] as const) {
      const link = screen.getByRole('link', { name: `Source of the ${what} (opens in a new tab)` });
      expect(link).toHaveAttribute('href', url);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    expect(screen.queryByText('source TODO')).toBeNull();
  });
});
