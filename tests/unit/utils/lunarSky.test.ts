import { describe, expect, it } from 'vitest';
import {
  EARTH_RADIUS_KM,
  MOON_RADIUS_KM,
  SUN_RADIUS_KM,
  aboveHorizonTest,
  angularRadiusDeg,
  describeElevation,
  distanceFromSite,
  upperLimbTest,
  earthDirection,
  earthElevation,
  elevationOf,
  lunarSky,
  subPoint,
  sunDirection,
  sunElevation,
  surfacePoint,
  type LatLon,
  greatCircleKm,
} from '../../../src/utils/lunarSky';

/**
 * JPL Horizons (docs/DATA_SOURCES.md SRC-019): Moon from the geocentre, quantities 14 and 15,
 * MOON_ME frame, converted to east-positive longitude in −180..180.
 */
const HORIZONS: readonly { utc: string; sun: LatLon; earth: LatLon }[] = [
  {
    utc: '2026-10-25T18:35:00Z',
    sun: { lat: -1.396128, lon: 0.788712 },
    earth: { lat: -5.662302, lon: -4.59982 },
  },
  {
    utc: '2024-02-22T23:23:00Z',
    sun: { lat: -1.108183, lon: 19.733973 },
    earth: { lat: -5.803823, lon: 2.951536 },
  },
  {
    utc: '2025-03-02T08:34:00Z',
    sun: { lat: -0.442223, lon: 148.047293 },
    earth: { lat: -1.911237, lon: 0.071942 },
  },
];

/** The user asked for 0.5°; the library actually agrees to about 0.01°, so hold it to 0.1°. */
const TOLERANCE_DEG = 0.1;

function expectNear(actual: LatLon, expected: LatLon) {
  expect(Math.abs(actual.lat - expected.lat)).toBeLessThan(TOLERANCE_DEG);
  const dLon = ((actual.lon - expected.lon + 540) % 360) - 180;
  expect(Math.abs(dLon)).toBeLessThan(TOLERANCE_DEG);
}

describe('sky maths against JPL Horizons', () => {
  it.each(HORIZONS)('puts the sub-solar point where Horizons does at $utc', ({ utc, sun }) => {
    expectNear(subPoint(sunDirection(new Date(utc))), sun);
  });

  it.each(HORIZONS)('puts the sub-Earth point where Horizons does at $utc', ({ utc, earth }) => {
    expectNear(subPoint(earthDirection(new Date(utc))), earth);
  });
});

describe('Sun and Earth elevation (smooth sphere)', () => {
  const nearFull = new Date('2026-10-25T18:35:00Z');

  it('has the Sun nearly overhead at 0° N 0° E near full Moon', () => {
    expect(sunElevation(0, 0, nearFull)).toBeGreaterThan(85);
  });

  it('has the Sun overhead at the sub-solar point and below the horizon opposite it', () => {
    const point = subPoint(sunDirection(nearFull));
    expect(sunElevation(point.lat, point.lon, nearFull)).toBeGreaterThan(89.9);
    expect(sunElevation(-point.lat, point.lon + 180, nearFull)).toBeLessThan(-89.9);
  });

  it('has the Earth near overhead at 0° N 0° E and below the horizon at 0° N 180°', () => {
    for (const { utc } of HORIZONS) {
      const date = new Date(utc);
      expect(earthElevation(0, 0, date)).toBeGreaterThan(80);
      expect(earthElevation(0, 180, date)).toBeLessThan(-80);
    }
  });

  it('returns unit directions', () => {
    for (const v of [sunDirection(nearFull), earthDirection(nearFull)]) {
      expect(Math.hypot(...v)).toBeCloseTo(1, 12);
    }
  });
});

describe('body-fixed frame', () => {
  it('uses the same axes as Cesium on the Moon: x at 0° E, y at 90° E, z north', () => {
    const at = (lat: number, lon: number) =>
      surfacePoint({ lat, lon }).map((c) => c / MOON_RADIUS_KM);
    expect(at(0, 0)[0]).toBeCloseTo(1, 12);
    expect(at(0, 90)[1]).toBeCloseTo(1, 12);
    expect(at(90, 0)[2]).toBeCloseTo(1, 12);
    expect(subPoint([0, -1, 0])).toEqual({ lat: 0, lon: -90 });
  });

  it('measures elevation from the site, so a nearby body sits lower than from the centre', () => {
    // A body 384,400 km out over the horizon point: seen from the centre it is 90° from overhead
    // at the pole, but from the surface it dips by the parallax (about 0.26°).
    const target: [number, number, number] = [384_400, 0, 0];
    const fromPole = elevationOf(target, { lat: 90, lon: 0 });
    expect(fromPole).toBeLessThan(0);
    expect(fromPole).toBeGreaterThan(-0.3);
  });
});

describe('chip wording', () => {
  it('gives whole degrees up, or below horizon', () => {
    expect(describeElevation('Sun', 12.4)).toBe('Sun 12° up');
    expect(describeElevation('Earth', 0.2)).toBe('Earth 0° up');
    expect(describeElevation('Earth', -0.2)).toBe('Earth below horizon');
  });

  it('follows the upper-limb answer when given: up with the centre below 0° reads 0° up', () => {
    expect(describeElevation('Earth', -0.6, true)).toBe('Earth 0° up');
    expect(describeElevation('Sun', -0.4, false)).toBe('Sun below horizon');
  });
});

describe('angularRadiusDeg (docs/LANDER_RULES.md, "Is it up: the upper limb")', () => {
  it('gives about 0.2665° for the Sun at 1 AU and 0.9507° for the Earth at 384,400 km', () => {
    expect(SUN_RADIUS_KM).toBe(695_700);
    expect(EARTH_RADIUS_KM).toBe(6378.137);
    expect(angularRadiusDeg(SUN_RADIUS_KM, 149_597_870.7)).toBeCloseTo(0.2665, 3);
    expect(angularRadiusDeg(EARTH_RADIUS_KM, 384_400)).toBeCloseTo(0.9507, 3);
  });
});

describe('upperLimbTest', () => {
  // At 0° N 0° E "up" is +x and north is +z: a body `distance` km from the site at `elevation`.
  const site = { lat: 0, lon: 0 };
  const at = (elevation: number, distance: number): [number, number, number] => [
    MOON_RADIUS_KM + distance * Math.sin((elevation * Math.PI) / 180),
    0,
    distance * Math.cos((elevation * Math.PI) / 180),
  ];
  const AU = 149_597_870.7;
  const limbUp = upperLimbTest(site);

  it('measures the distance from the site', () => {
    expect(distanceFromSite(at(-0.3, AU), site)).toBeCloseTo(AU, 0);
    expect(distanceFromSite(at(12, 384_400), site)).toBeCloseTo(384_400, 6);
  });

  it('counts a body up over a flat horizon while any of its disc is above it', () => {
    // The Sun's radius at 1 AU is 0.2665°: just above and just below the horizon.
    expect(limbUp(at(-0.26, AU), SUN_RADIUS_KM)).toBe(true);
    expect(limbUp(at(-0.27, AU), SUN_RADIUS_KM)).toBe(false);
    // The Earth's radius at 384,400 km is 0.9507°.
    expect(limbUp(at(-0.95, 384_400), EARTH_RADIUS_KM)).toBe(true);
    expect(limbUp(at(-0.952, 384_400), EARTH_RADIUS_KM)).toBe(false);
    expect(limbUp(at(-0.1, AU), SUN_RADIUS_KM, 0)).toBe(true);
  });

  it('works the same against a terrain horizon', () => {
    // Terrain 2° high: the Sun's centre at 1.74° has its limb at 2.0065°, at 1.73° at 1.9965°.
    expect(limbUp(at(1.74, AU), SUN_RADIUS_KM, 2)).toBe(true);
    expect(limbUp(at(1.73, AU), SUN_RADIUS_KM, 2)).toBe(false);
    expect(limbUp(at(-89.9, AU), SUN_RADIUS_KM, -90)).toBe(true);
    expect(limbUp(at(80, AU), SUN_RADIUS_KM, 90)).toBe(false);
  });

  it('agrees with elevationOf + angularRadiusDeg on real positions', () => {
    const polar = { lat: -85.5, lon: 31 };
    const test = upperLimbTest(polar);
    for (const utc of ['2026-11-09T12:00:00Z', '2026-11-22T12:00:00Z', '2025-03-02T08:34:00Z']) {
      const sky = lunarSky(new Date(utc));
      for (const [target, radius] of [
        [sky.sun, SUN_RADIUS_KM],
        [sky.earth, EARTH_RADIUS_KM],
      ] as const) {
        const limb =
          elevationOf(target, polar) + angularRadiusDeg(radius, distanceFromSite(target, polar));
        expect(test(target, radius, limb - 0.01)).toBe(true);
        expect(test(target, radius, limb + 0.01)).toBe(false);
      }
    }
  });
});

describe('aboveHorizonTest', () => {
  it('agrees with elevationOf on either side of the threshold', () => {
    const site = { lat: -85.5, lon: 31 };
    const above = aboveHorizonTest(site);
    for (const utc of ['2026-11-09T12:00:00Z', '2026-11-22T12:00:00Z', '2025-03-02T08:34:00Z']) {
      const sky = lunarSky(new Date(utc));
      for (const target of [sky.sun, sky.earth]) {
        const elevation = elevationOf(target, site);
        expect(above(target, elevation - 0.01)).toBe(true);
        expect(above(target, elevation + 0.01)).toBe(false);
      }
    }
  });
});

describe('greatCircleKm', () => {
  it('measures along the mean sphere: a quarter turn is about 2729 km, the same point 0', () => {
    expect(greatCircleKm({ lat: 0, lon: 0 }, { lat: 0, lon: 90 })).toBeCloseTo(2729.1, 0);
    expect(greatCircleKm({ lat: 0, lon: 0 }, { lat: 90, lon: 0 })).toBeCloseTo(2729.1, 0);
    expect(greatCircleKm({ lat: 12.4, lon: -31.8 }, { lat: 12.4, lon: -31.8 })).toBe(0);
  });
});
