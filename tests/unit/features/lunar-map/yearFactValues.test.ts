import { describe, expect, it } from 'vitest';
import { yearFacts } from '../../../../src/features/lunar-map/yearFactValues';
import type { HorizonsSeries } from '../../../../src/services/horizonsData';
import type { HorizonProfile } from '../../../../src/utils/terrainShadow';

const STEP = 600_000;
const START = Date.UTC(2027, 0, 1);
const COUNT = 365 * 144 + 1;

/** A made-up series over 2027 (not Horizons data): the Earth always at `earthDeg`. */
function series(earthDeg: number): HorizonsSeries {
  return {
    siteId: 'test',
    startMs: START,
    stepMs: STEP,
    count: COUNT,
    sunAz: new Uint16Array(COUNT),
    sunEl: new Int16Array(COUNT),
    earthAz: new Uint16Array(COUNT).fill(9000),
    earthEl: new Int16Array(COUNT).fill(Math.round(earthDeg * 100)),
  };
}

const POLAR = { lat: -84.79, lon: 29.2 };
const NORTH = { lat: 18.56, lon: 61.81 };
const byId = (facts: ReturnType<typeof yearFacts>, id: string) => facts.find((f) => f.id === id);

describe('yearFacts (docs/LANDER_RULES.md, "Light, water and Earth over the year")', () => {
  it('says Light and Water are unavailable inside the south-polar data, until the file is loaded', () => {
    const facts = yearFacts(POLAR, null, null);
    expect(byId(facts, 'light')).toMatchObject({
      label: '% of the year in sunlight',
      value: 'Unavailable: the PGDA lighting file isn’t loaded yet',
      status: 'Unavailable',
    });
    expect(byId(facts, 'water')).toMatchObject({
      label: 'Nearest permanent shadow (where ice may be)',
      status: 'Unavailable',
    });
    // 80° S itself is inside the data.
    expect(byId(yearFacts({ lat: -80, lon: 0 }, null, null), 'light')?.value).toMatch(
      /^Unavailable/,
    );
  });

  it('says Light and Water do not apply outside the south-polar data, and never claims ice', () => {
    const facts = yearFacts(NORTH, null, null);
    expect(byId(facts, 'light')?.value).toBe('Not applicable: outside south-polar data');
    expect(byId(facts, 'water')?.value).toBe('Not applicable: outside south-polar data');
    for (const fact of [...facts, ...yearFacts(POLAR, null, null)]) {
      expect(`${fact.label} ${fact.value}`).not.toMatch(/ice is|there is ice|ice found/i);
    }
  });

  it('calculates the Earth over 2027 from the series, flat or over the terrain horizon', () => {
    expect(byId(yearFacts(NORTH, null, null), 'earth')).toMatchObject({
      value: 'Unavailable until the JPL Horizons positions load',
      status: 'Unavailable',
    });
    // Loading finished without a series: say so, rather than "until … load" for ever.
    expect(byId(yearFacts(NORTH, null, null, true), 'earth')?.value).toBe(
      'Unavailable: the JPL Horizons file didn’t load',
    );
    expect(byId(yearFacts(NORTH, series(5), null), 'earth')).toEqual({
      id: 'earth',
      label: 'Earth above the horizon in 2027',
      value: '100.0% of 2027',
      status: 'Calculated',
      source: 'JPL Horizons (SRC-055), 2027, flat horizon',
    });
    expect(byId(yearFacts(NORTH, series(-5), null), 'earth')?.value).toBe('0.0% of 2027');
    // A made-up terrain horizon 10° high: the Earth at 5° is behind it all year.
    const ridge: HorizonProfile = {
      elevations: new Float32Array(360).fill(10),
      radiusM: 1000,
      spacingM: 80,
      source: 'TEST: made up',
    };
    expect(byId(yearFacts(POLAR, series(5), ridge), 'earth')).toMatchObject({
      value: '0.0% of 2027',
      source: 'JPL Horizons (SRC-055), 2027, terrain horizon',
    });
  });
});
