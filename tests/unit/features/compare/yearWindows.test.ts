import { describe, expect, it } from 'vitest';
import {
  positionsNote,
  stateAt,
  yearWindows,
  type SkyState,
  type YearSite,
} from '../../../../src/features/compare/yearWindows';
import type { HorizonsSeries } from '../../../../src/services/horizonsData';
import { skyAtHour, upTest } from '../../../../src/utils/skyVisibility';
import type { HorizonProfile } from '../../../../src/utils/terrainShadow';
import { HOUR_MS } from '../../../../src/utils/time';

const START = Date.UTC(2027, 0, 1);
const STEP = 10 * 60_000;
const COUNT = 2 * 144 + 1; // two days of 10-minute samples, both ends included
const THRESHOLDS = { minSunElevationDeg: 5, minEarthElevationDeg: 5 };
const PLACE = { lat: -84.79, lon: 29.2 };

/**
 * A made-up series (not Horizons data) for two days from START: the Sun 10° up for the first day
 * then 10° down; the Earth up for 12 h, down until 36 h, then up again.
 */
function series(): HorizonsSeries {
  const sunEl = new Int16Array(COUNT);
  const earthEl = new Int16Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    const hours = (i * STEP) / HOUR_MS;
    sunEl[i] = hours < 24 ? 1000 : -1000;
    earthEl[i] = hours < 12 || hours >= 36 ? 1000 : -1000;
  }
  return {
    siteId: 'test',
    startMs: START,
    stepMs: STEP,
    count: COUNT,
    sunAz: new Uint16Array(COUNT).fill(9000),
    sunEl,
    earthAz: new Uint16Array(COUNT),
    earthEl,
  };
}

const site = (overrides: Partial<YearSite> = {}): YearSite => ({
  ...PLACE,
  thresholds: THRESHOLDS,
  ...overrides,
});
const h = (hours: number) => START + hours * HOUR_MS;

describe('yearWindows (docs/LANDER_RULES.md, "Timeline")', () => {
  it('turns each 6-hour step into a state and merges neighbouring steps that agree', () => {
    const year = yearWindows(site({ series: series() }), START, 1);
    expect(year.runs.slice(0, 3)).toEqual([
      { start: h(0), end: h(12), state: 'both' },
      { start: h(12), end: h(24), state: 'sun' },
      { start: h(24), end: h(36), state: 'none' },
    ]);
    expect(year.runs[3]).toMatchObject({ start: h(36), state: 'earth' });
    expect(year.runs[3]?.end).toBeGreaterThanOrEqual(h(54));
    // Neighbouring runs never share a state.
    year.runs.forEach((run, index) => {
      const next = year.runs[index + 1];
      if (next) {
        expect(next.state).not.toBe(run.state);
        expect(next.start).toBe(run.end);
      }
    });
  });

  it('uses the Horizons series where it has the step, and the engine elsewhere', () => {
    const year = yearWindows(site({ series: series() }), START, 1);
    // Steps at 0, 6, …, 48 h fall inside the two days of samples.
    expect(year.horizonsSteps).toBe(9);
    expect(year.steps).toBe(31 * 4);
    // Without a series every step is the engine's, tested the same way as the checks.
    const engine = yearWindows(site(), START, 1);
    expect(engine.horizonsSteps).toBe(0);
    const up = upTest(PLACE);
    for (const hours of [0, 6, 300, 600]) {
      const sky = skyAtHour(Math.floor(h(hours) / HOUR_MS));
      const sun = up(sky.sun, 5);
      const earth = up(sky.earth, 5);
      const expected: SkyState = sun && earth ? 'both' : sun ? 'sun' : earth ? 'earth' : 'none';
      expect(stateAt(engine, h(hours))).toBe(expected);
    }
  });

  it('counts a body as up only above the terrain horizon where the site has one', () => {
    // A made-up terrain horizon 20° high all round: the Sun and Earth at 10° are behind it.
    const ridge: HorizonProfile = {
      elevations: new Float32Array(360).fill(20),
      radiusM: 1000,
      spacingM: 80,
      source: 'TEST: made up',
    };
    const year = yearWindows(site({ series: series(), terrain: ridge }), START, 1);
    expect(year.runs[0]).toMatchObject({ start: h(0), state: 'none' });
    expect(year.runs[0]?.end).toBeGreaterThanOrEqual(h(54));
  });

  it('steps every 6 hours by default: about 1,460 steps for 12 months', () => {
    const year = yearWindows(site(), START);
    expect(year.steps).toBe(365 * 4);
    expect(year.end).toBe(Date.UTC(2028, 0, 1));
    for (const run of year.runs) expect((run.start - START) % (6 * HOUR_MS)).toBe(0);
    expect(yearWindows(site(), START, 12, 24).steps).toBe(365);
  });

  it('starts at 00:00 UTC on the start date and ends on the same day months later', () => {
    // 31 Jan + 1 month is 28 Feb (the month has no 31st).
    const year = yearWindows(site(), Date.UTC(2027, 0, 31, 15, 20), 1);
    expect(year.start).toBe(Date.UTC(2027, 0, 31));
    expect(year.end).toBe(Date.UTC(2027, 1, 28));
    expect(year.steps).toBe(28 * 4);
    expect(year.runs[0]?.start).toBe(year.start);
    expect(year.runs[year.runs.length - 1]?.end).toBe(year.end);
  });
});

describe('positionsNote', () => {
  it('names where the engine took over from JPL Horizons', () => {
    // The made-up series covers only the first two days, so the engine has the rest.
    expect(positionsNote(yearWindows(site({ series: series() }), START, 1))).toBe(
      'Positions: JPL Horizons (our engine after 3 Jan 2027)',
    );
    // Starting a day before the series: the engine before it, too.
    expect(positionsNote(yearWindows(site({ series: series() }), START - 86_400_000, 1))).toBe(
      'Positions: JPL Horizons (our engine before 1 Jan 2027 and after 3 Jan 2027)',
    );
    expect(positionsNote(yearWindows(site(), START, 1))).toBe(
      'Positions: our engine (checked against JPL Horizons)',
    );
  });
});
