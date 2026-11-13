import { describe, expect, it } from 'vitest';
import {
  ENGINE_LABEL,
  positionsLabel,
  positionsOf,
} from '../../../../src/features/lunar-map/horizonsPositions';
import { HORIZONS_LABEL, type HorizonsSeries } from '../../../../src/services/horizonsData';
import { DAY_MS } from '../../../../src/utils/time';

const STEP = 10 * 60_000;
const START = Date.UTC(2026, 10, 1);
const DAYS = 10;
const COUNT = (DAYS * DAY_MS) / STEP + 1;

/** A made-up series (not Horizons data): Sun at 12.34° toward 90°, Earth at 5° toward 0°. */
const SERIES: HorizonsSeries = {
  siteId: 'test',
  startMs: START,
  stepMs: STEP,
  count: COUNT,
  sunAz: new Uint16Array(COUNT).fill(9000),
  sunEl: new Int16Array(COUNT).fill(1234),
  earthAz: new Uint16Array(COUNT).fill(0),
  earthEl: new Int16Array(COUNT).fill(500),
};

describe('positionsLabel', () => {
  it('says JPL Horizons when the series covers every hour of the range', () => {
    expect(positionsLabel(SERIES, { start: START, end: START + 3 * DAY_MS })).toBe(HORIZONS_LABEL);
    expect(HORIZONS_LABEL).toBe('Sun and Earth positions: JPL Horizons');
  });

  it('says our engine for points (no series) and for dates outside the files', () => {
    expect(positionsLabel(null, { start: START, end: START + DAY_MS })).toBe(ENGINE_LABEL);
    expect(ENGINE_LABEL).toBe('Sun and Earth positions: our engine (checked against JPL Horizons)');
    expect(positionsLabel(SERIES, { start: START - 5 * DAY_MS, end: START - DAY_MS })).toBe(
      ENGINE_LABEL,
    );
  });

  it('says which hours came from which when a range is only partly inside the files', () => {
    expect(positionsLabel(SERIES, { start: START - DAY_MS, end: START + DAY_MS })).toBe(
      'Sun and Earth positions: JPL Horizons for 24 of 48 hours; our engine (checked against JPL Horizons) for the hours before 1 Nov 2026',
    );
    expect(
      positionsLabel(SERIES, { start: START - DAY_MS, end: START + (DAYS + 1) * DAY_MS }),
    ).toMatch(/for the hours before 1 Nov 2026 and after 11 Nov 2026$/);
  });
});

describe('positionsOf', () => {
  it('reads the series as a position source, and nothing outside it', () => {
    const positions = positionsOf(SERIES);
    expect(positions?.stepMs).toBe(STEP);
    expect(positions?.azEl('sun', START + 5 * STEP)).toEqual({ azimuth: 90, elevation: 12.34 });
    expect(positions?.azEl('earth', START + 5 * STEP)).toEqual({ azimuth: 0, elevation: 5 });
    expect(positions?.azEl('sun', START - STEP)).toBeNull();
    expect(positionsOf(null)).toBeNull();
  });
});
