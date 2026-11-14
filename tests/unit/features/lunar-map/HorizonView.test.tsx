import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HorizonView } from '../../../../src/features/lunar-map/HorizonView';
import { bodyNow } from '../../../../src/utils/riseSet';
import type { HorizonProfile } from '../../../../src/utils/terrainShadow';
import { dayCentre, rangeAround } from '../../../../src/utils/time';

const TIME = Date.parse('2026-11-15T02:00:00Z');
const RANGE = rangeAround(dayCentre(TIME));
// A south-polar place (north in the middle of the chart).
const PLACE = { lat: -84.79, lon: 29.2 };

/** A made-up terrain horizon: level, with the given whole azimuths cut off at the data edge. */
function profile(cut: readonly number[] | null): HorizonProfile {
  const result: HorizonProfile = {
    elevations: new Float32Array(360),
    radiusM: 50_000,
    spacingM: 80,
    source: 'TEST: made up for this test',
  };
  if (cut) {
    const edgeCut = new Uint8Array(360);
    for (const azimuth of cut) edgeCut[azimuth] = 1;
    result.edgeCut = edgeCut;
  }
  return result;
}

function renderView(terrain: HorizonProfile | null, kind?: 'site' | 'point') {
  return render(
    <HorizonView
      place={PLACE}
      range={RANGE}
      sun={bodyNow(PLACE, 'sun', TIME)}
      earth={bodyNow(PLACE, 'earth', TIME)}
      minSunElevationDeg={5}
      terrain={terrain}
      kind={kind}
    />,
  );
}

const span = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index);

describe('HorizonView', () => {
  it('says the horizon is flat when a site has no terrain data', () => {
    renderView(null);
    expect(screen.getByText('Flat horizon: no terrain data for this site')).toBeInTheDocument();
    expect(screen.queryAllByTestId('edge-cut-band')).toHaveLength(0);
  });

  it('says "this point" for a picked point', () => {
    renderView(null, 'point');
    expect(screen.getByText('Flat horizon: no terrain data for this point')).toBeInTheDocument();
  });

  it('marks directions cut off at the data edge with a band and names them', () => {
    renderView(profile(span(120, 150)));
    expect(screen.getAllByTestId('edge-cut-band')).toHaveLength(1);
    expect(screen.getByText(/Cut off at data edge:\s*120°–150°/)).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /cut off at data edge toward 120°–150°/ }),
    ).toBeVisible();
  });

  it('splits a band where it crosses the edge of the chart (south, for a southern place)', () => {
    renderView(profile(span(170, 190)));
    expect(screen.getAllByTestId('edge-cut-band')).toHaveLength(2);
    expect(screen.getByText(/Cut off at data edge:\s*170°–190°/)).toBeInTheDocument();
  });

  it('shows no data-edge mark when the terrain reached its full distance everywhere', () => {
    renderView(profile([]));
    expect(screen.queryAllByTestId('edge-cut-band')).toHaveLength(0);
    expect(screen.queryByText(/Cut off at data edge/)).toBeNull();
    expect(screen.getByText(/^Terrain horizon: TEST: made up for this test/)).toBeInTheDocument();
  });
});
