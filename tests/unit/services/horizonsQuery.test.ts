import { describe, expect, it } from 'vitest';
import {
  horizonsParams,
  horizonsTime,
  viewInHorizonsUrl,
} from '../../../src/services/horizonsQuery';

describe('horizonsTime', () => {
  it('formats UTC as Horizons reads it', () => {
    expect(horizonsTime(Date.UTC(2026, 10, 1, 0, 0))).toBe('2026-11-01 00:00');
    expect(horizonsTime(Date.UTC(2027, 11, 31, 23, 50))).toBe('2027-12-31 23:50');
  });
});

describe('horizonsParams', () => {
  it('asks for the body seen from the site on the Moon, azimuth and elevation only', () => {
    const params = horizonsParams({
      body: 'earth',
      site: { lat: -84.79, lon: 29.2 },
      start: Date.UTC(2026, 10, 1),
      stop: Date.UTC(2026, 10, 30, 23, 50),
      step: '10 m',
      format: 'json',
      csv: true,
    });
    expect(params).toMatchObject({
      COMMAND: "'399'",
      EPHEM_TYPE: "'OBSERVER'",
      CENTER: "'coord@301'",
      COORD_TYPE: "'GEODETIC'",
      SITE_COORD: "'29.2,-84.79,0'",
      START_TIME: "'2026-11-01 00:00'",
      STOP_TIME: "'2026-11-30 23:50'",
      STEP_SIZE: "'10 m'",
      QUANTITIES: "'4'",
      CSV_FORMAT: "'YES'",
    });
  });
});

describe('viewInHorizonsUrl', () => {
  it('opens the site and range as plain text in 1-hour steps', () => {
    const url = new URL(
      viewInHorizonsUrl(
        'sun',
        { lat: -80.13, lon: 1.44 },
        { start: Date.UTC(2026, 11, 12), end: Date.UTC(2026, 11, 25) },
      ),
    );
    expect(url.origin + url.pathname).toBe('https://ssd.jpl.nasa.gov/api/horizons.api');
    expect(url.searchParams.get('format')).toBe('text');
    expect(url.searchParams.get('COMMAND')).toBe("'10'");
    expect(url.searchParams.get('SITE_COORD')).toBe("'1.44,-80.13,0'");
    expect(url.searchParams.get('START_TIME')).toBe("'2026-12-12 00:00'");
    expect(url.searchParams.get('STOP_TIME')).toBe("'2026-12-25 00:00'");
    expect(url.searchParams.get('STEP_SIZE')).toBe("'1 h'");
    expect(url.searchParams.get('QUANTITIES')).toBe("'4'");
  });
});
