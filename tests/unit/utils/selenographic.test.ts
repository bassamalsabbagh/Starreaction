import { describe, expect, it } from 'vitest';
import {
  COORDINATE_CONVENTION,
  LATITUDE_MAX,
  LATITUDE_MIN,
  LONGITUDE_MAX,
  LONGITUDE_MIN,
  MAX_COORDINATE_QUERY_LENGTH,
  formatCoordinate,
  formatDegreeRange,
  isValidCoordinate,
  isValidLatitude,
  isValidLongitude,
  normalizeLongitude,
  parseCoordinateQuery,
} from '../../../src/utils/selenographic';

describe('coordinate convention constants', () => {
  it('uses the provisional ranges', () => {
    expect([LATITUDE_MIN, LATITUDE_MAX, LONGITUDE_MIN, LONGITUDE_MAX]).toEqual([
      -90, 90, -180, 180,
    ]);
    expect(COORDINATE_CONVENTION.latitude).toEqual({ min: -90, max: 90 });
    expect(COORDINATE_CONVENTION.longitude).toEqual({ min: -180, max: 180 });
    expect(COORDINATE_CONVENTION.longitudeDirection).toBe('east-positive');
    expect(COORDINATE_CONVENTION.status).toBe('provisional');
  });

  it('describes the ranges, direction and provisional status in its description', () => {
    const { description } = COORDINATE_CONVENTION;
    expect(description).toContain('−90° to +90°');
    expect(description).toContain('−180° to +180°');
    expect(description).toMatch(/east-positive/);
    expect(description).toMatch(/provisional/);
    expect(description).toMatch(/confirmed against the data sources/);
  });

  it('formats degree ranges with typographic signs', () => {
    expect(formatDegreeRange(-90, 90)).toBe('−90° to +90°');
    expect(formatDegreeRange(0, 45)).toBe('0° to +45°');
  });
});

describe('isValidLatitude', () => {
  it.each([-90, 90, 0, -0, 45.5])('accepts %s', (value) => {
    expect(isValidLatitude(value)).toBe(true);
  });

  it.each([-90.0001, 90.0001, Number.NaN, Infinity, -Infinity])('rejects %s', (value) => {
    expect(isValidLatitude(value)).toBe(false);
  });
});

describe('isValidLongitude', () => {
  it.each([-180, 180, 0, -0, -45])('accepts %s', (value) => {
    expect(isValidLongitude(value)).toBe(true);
  });

  it.each([-180.0001, 180.0001, 360, Number.NaN, Infinity, -Infinity])('rejects %s', (value) => {
    expect(isValidLongitude(value)).toBe(false);
  });
});

describe('isValidCoordinate', () => {
  it('requires both axes to be valid', () => {
    expect(isValidCoordinate({ lat: 90, lon: -180 })).toBe(true);
    expect(isValidCoordinate({ lat: 91, lon: 0 })).toBe(false);
    expect(isValidCoordinate({ lat: 0, lon: 181 })).toBe(false);
    expect(isValidCoordinate({ lat: Number.NaN, lon: 0 })).toBe(false);
  });
});

describe('normalizeLongitude', () => {
  it.each([
    [0, 0],
    [45.5, 45.5],
    [-179.9, -179.9],
    [180, 180],
    [-180, -180],
  ])('returns in-range value %s unchanged', (input, expected) => {
    expect(normalizeLongitude(input)).toBe(expected);
  });

  it.each([
    [190, -170],
    [-190, 170],
    [360, 0],
    [540, -180],
    [-540, -180],
    [720, 0],
    [-360, 0],
    [181, -179],
    [-181, 179],
  ])('wraps %s to %s', (input, expected) => {
    expect(normalizeLongitude(input)).toBe(expected);
  });

  it('wraps fractional values', () => {
    expect(normalizeLongitude(190.5)).toBeCloseTo(-169.5, 10);
  });

  it('never returns −0', () => {
    expect(Object.is(normalizeLongitude(-0), 0)).toBe(true);
    expect(Object.is(normalizeLongitude(360), 0)).toBe(true);
    expect(Object.is(normalizeLongitude(-360), 0)).toBe(true);
  });

  it.each([Number.NaN, Infinity, -Infinity])('returns NaN for %s', (value) => {
    expect(normalizeLongitude(value)).toBeNaN();
  });
});

describe('parseCoordinateQuery', () => {
  it.each([
    ['12.5, -45', 12.5, -45],
    ['12.5 -45', 12.5, -45],
    ['12.5,-45', 12.5, -45],
    ['  12.5 ,  -45  ', 12.5, -45],
    ['+12.5, +45', 12.5, 45],
    ['12.5N 45W', 12.5, -45],
    ['12.5n 45w', 12.5, -45],
    ['12.5° S, 45° E', -12.5, 45],
    ['12.5°S 45°E', -12.5, 45],
    ['12.5 N, 45', 12.5, 45],
    ['90, 180', 90, 180],
    ['-90, -180', -90, -180],
    ['.5, 12.', 0.5, 12],
  ])('parses "%s"', (input, lat, lon) => {
    expect(parseCoordinateQuery(input)).toEqual({ ok: true, value: { lat, lon } });
  });

  it('returns 0 rather than −0', () => {
    const result = parseCoordinateQuery('-0, 0 W');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.is(result.value.lat, 0)).toBe(true);
      expect(Object.is(result.value.lon, 0)).toBe(true);
    }
    const southZero = parseCoordinateQuery('0 S, 0 E');
    expect(southZero.ok && Object.is(southZero.value.lat, 0)).toBe(true);
  });

  function expectError(input: string, pattern: RegExp) {
    const result = parseCoordinateQuery(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(pattern);
    }
  }

  it.each(['', '   ', '\t\n'])('rejects empty input %j', (input) => {
    expectError(input, /enter a coordinate/i);
  });

  it.each(['abc', 'north, east', '°, °'])('rejects non-numeric input "%s"', (input) => {
    expectError(input, /must be numbers/i);
  });

  it.each(['12 abc 45', '12, 45km', '12; 45'])('rejects unexpected text in "%s"', (input) => {
    expectError(input, /unexpected text/i);
  });

  it.each([
    ['12', 1],
    ['12 N', 1],
    ['12, 45, 67', 3],
    ['12 45 67', 3],
  ])('rejects "%s" with the wrong count of numbers', (input, count) => {
    expectError(input, new RegExp(`exactly two numbers .* found ${count}`, 'i'));
  });

  it.each(['12 , , 45', 'N 12, W 45', '12NN 45', '12 °° 45'])(
    'rejects malformed input "%s"',
    (input) => {
      expectError(input, /could not read/i);
    },
  );

  it.each(['-12 S, 45', '12, -45 W', '+12 N, 45'])(
    'rejects a sign combined with a hemisphere letter in "%s"',
    (input) => {
      expectError(input, /either a sign .* or a hemisphere letter/i);
    },
  );

  it.each(['12 E, 45 N', '12 W, 45', '12, 45 S', '12 N, 45 N'])(
    'rejects hemisphere letters on the wrong axis in "%s"',
    (input) => {
      expectError(input, /wrong axis/i);
    },
  );

  it.each(['90.01, 0', '-91, 0', '91 N, 0', '90.5 S, 0'])(
    'rejects out-of-range latitude "%s"',
    (input) => {
      expectError(input, /latitude must be from −90° to \+90°/i);
    },
  );

  it.each(['0, 180.01', '0, -181', '0, 270', '0, 360', '0, 190 E'])(
    'rejects out-of-range longitude "%s" without wrapping',
    (input) => {
      expectError(input, /longitude must be from −180° to \+180° .* not converted automatically/i);
    },
  );

  it('echoes the entered out-of-range value with a typographic minus', () => {
    expectError('-91, 0', /\(got −91°\)\.$/);
    expectError('91 S, 0', /\(got −91°\)\.$/);
    expectError('0, 270', /\(got 270°\)\./);
  });

  it('does not print huge out-of-range values verbatim', () => {
    const huge = '9'.repeat(40);
    const result = parseCoordinateQuery(`${huge}, 0`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/latitude must be from .*far out of range/i);
      expect(result.error).not.toMatch(/infinity|e\+/i);
    }
    expectError(`0, ${huge}`, /longitude must be from .*far out of range/i);
  });

  it.each([
    ['−12, 45', -12, 45],
    ['12, −45', 12, -45],
    ['−12.5 −45', -12.5, -45],
  ])('accepts the typographic minus (U+2212) in "%s"', (input, lat, lon) => {
    expect(parseCoordinateQuery(input)).toEqual({ ok: true, value: { lat, lon } });
  });

  it.each(['−12 S, 45', '12, −45 W'])(
    'rejects a typographic minus combined with a hemisphere letter in "%s"',
    (input) => {
      expectError(input, /either a sign .* or a hemisphere letter/i);
    },
  );

  it.each(['1e5, 2', '1E5 2', '12, 4.5e-3', '1e+2, 3'])(
    'rejects exponent notation in "%s"',
    (input) => {
      expectError(input, /exponent notation .* not supported/i);
    },
  );

  it.each([
    ['12.5 N, 45.5 E', 12.5, 45.5],
    ['12.5N, 45.5E', 12.5, 45.5],
    ['12.5, 45E', 12.5, 45],
    ['12.5n 45e', 12.5, 45],
  ])('still parses the E hemisphere letter in "%s"', (input, lat, lon) => {
    expect(parseCoordinateQuery(input)).toEqual({ ok: true, value: { lat, lon } });
  });

  it('normalises runs of whitespace, including around commas, ° and hemisphere letters', () => {
    expect(parseCoordinateQuery('12.5   °   S   ,   45  °  E')).toEqual({
      ok: true,
      value: { lat: -12.5, lon: 45 },
    });
    expect(parseCoordinateQuery('12.5 \t\n -45')).toEqual({
      ok: true,
      value: { lat: 12.5, lon: -45 },
    });
  });

  describe('input length cap', () => {
    it('exports a cap of 100 characters', () => {
      expect(MAX_COORDINATE_QUERY_LENGTH).toBe(100);
    });

    it('accepts input exactly at the cap', () => {
      const input = '12.5, -45'.padEnd(MAX_COORDINATE_QUERY_LENGTH, ' ');
      expect(input).toHaveLength(MAX_COORDINATE_QUERY_LENGTH);
      expect(parseCoordinateQuery(input)).toEqual({ ok: true, value: { lat: 12.5, lon: -45 } });
    });

    it('rejects input one character over the cap', () => {
      const input = '12.5, -45'.padEnd(MAX_COORDINATE_QUERY_LENGTH + 1, ' ');
      expectError(input, /too long \(maximum 100 characters\)/i);
    });
  });

  describe('pathological whitespace input', () => {
    // Previously caused super-linear regex backtracking (4000 spaces took about 83 s).
    function timeParse(input: string) {
      const start = performance.now();
      const result = parseCoordinateQuery(input);
      return { result, elapsed: performance.now() - start };
    }

    it.each([1000, 2000, 4000])('rejects "1" + %i spaces + "N2" quickly', (spaces) => {
      const { result, elapsed } = timeParse(`1${' '.repeat(spaces)}N2`);
      expect(result.ok).toBe(false);
      expect(elapsed).toBeLessThan(50);
    });

    it.each([
      `1${' '.repeat(MAX_COORDINATE_QUERY_LENGTH - 3)}N2`,
      `1${' '.repeat(MAX_COORDINATE_QUERY_LENGTH - 4)}°N2`,
      `1${' ,'.repeat((MAX_COORDINATE_QUERY_LENGTH - 2) / 2)}2`,
    ])('handles whitespace-heavy input at the cap quickly (case %#)', (input) => {
      expect(input.length).toBeLessThanOrEqual(MAX_COORDINATE_QUERY_LENGTH);
      const { result, elapsed } = timeParse(input);
      expect(result.ok).toBe(false);
      expect(elapsed).toBeLessThan(50);
    });
  });
});

describe('formatCoordinate', () => {
  it('formats with hemisphere letters and two decimals by default', () => {
    expect(formatCoordinate({ lat: 12.5, lon: -45 })).toBe('12.50° N, 45.00° W');
    expect(formatCoordinate({ lat: -12.5, lon: 45 })).toBe('12.50° S, 45.00° E');
  });

  it('formats the latitude boundaries', () => {
    expect(formatCoordinate({ lat: 90, lon: 0 })).toBe('90.00° N, 0.00°');
    expect(formatCoordinate({ lat: -90, lon: 0 })).toBe('90.00° S, 0.00°');
  });

  it('prints ±180 longitude without E/W', () => {
    expect(formatCoordinate({ lat: 0, lon: 180 })).toBe('0.00°, 180.00°');
    expect(formatCoordinate({ lat: 0, lon: -180 })).toBe('0.00°, 180.00°');
    expect(formatCoordinate({ lat: 0, lon: 179.999 })).toBe('0.00°, 180.00°');
  });

  it('prints zero without a hemisphere letter, including −0 and values that round to zero', () => {
    expect(formatCoordinate({ lat: 0, lon: 0 })).toBe('0.00°, 0.00°');
    expect(formatCoordinate({ lat: -0, lon: -0 })).toBe('0.00°, 0.00°');
    expect(formatCoordinate({ lat: -0.004, lon: -0.001 })).toBe('0.00°, 0.00°');
    expect(formatCoordinate({ lat: 0.004, lon: 0.004 })).toBe('0.00°, 0.00°');
  });

  it('picks the hemisphere after rounding', () => {
    expect(formatCoordinate({ lat: -0.006, lon: 0.006 })).toBe('0.01° S, 0.01° E');
  });

  it('respects the precision argument', () => {
    expect(formatCoordinate({ lat: 12.3456, lon: -45.6789 }, 0)).toBe('12° N, 46° W');
    expect(formatCoordinate({ lat: 12.3456, lon: -45.6789 }, 3)).toBe('12.346° N, 45.679° W');
    expect(formatCoordinate({ lat: -0.4, lon: 0.4 }, 0)).toBe('0°, 0°');
  });

  it('sanitises an invalid precision instead of throwing', () => {
    expect(formatCoordinate({ lat: 1, lon: 1 }, -3)).toBe('1° N, 1° E');
    expect(formatCoordinate({ lat: 1, lon: 1 }, Number.NaN)).toBe('1.00° N, 1.00° E');
    expect(() => formatCoordinate({ lat: 1, lon: 1 }, 500)).not.toThrow();
  });

  it('returns a label instead of throwing for invalid coordinates', () => {
    expect(formatCoordinate({ lat: 91, lon: 0 })).toBe('Invalid coordinate');
    expect(formatCoordinate({ lat: 0, lon: Number.NaN })).toBe('Invalid coordinate');
    expect(formatCoordinate({ lat: Infinity, lon: 0 })).toBe('Invalid coordinate');
  });
});
