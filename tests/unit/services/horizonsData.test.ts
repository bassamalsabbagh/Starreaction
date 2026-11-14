import { describe, expect, it, vi } from 'vitest';
import {
  decodeHorizons,
  encodeHorizons,
  engineDistanceKm,
  horizonsAzEl,
  horizonsSky,
  loadHorizonsSeries,
  pointAt,
  positionsSource,
  readHorizonsIndex,
  shareAbove,
  siteSamples,
  YEAR_RANGE,
  type HorizonsIndex,
  type HorizonsSeries,
} from '../../../src/services/horizonsData';
import { azimuthElevationOf, distanceFromSite } from '../../../src/utils/lunarSky';
import { hourlySky, skyAtHour } from '../../../src/utils/skyVisibility';

const HOUR = 3_600_000;
const STEP = 10 * 60_000;
const START = Date.UTC(2026, 10, 1);

// Made-up values for these tests only (not Horizons data).
const series = (values: {
  sunAz: number[];
  sunEl: number[];
  earthAz: number[];
  earthEl: number[];
}): HorizonsSeries => {
  const decoded = decodeHorizons(encodeHorizons(values).buffer as ArrayBuffer, {
    siteId: 'test',
    startMs: START,
    stepMs: STEP,
    count: values.sunAz.length,
  });
  if (!decoded) throw new Error('decode failed');
  return decoded;
};

describe('encodeHorizons / decodeHorizons', () => {
  it('round-trips to the hundredth of a degree, azimuth 0–360 and signed elevation', () => {
    const s = series({
      sunAz: [0, 359.996, 123.456],
      sunEl: [-89.99, 0.004, 45.678],
      earthAz: [180, 90.5, 270.25],
      earthEl: [12.34, -1.23, 89.99],
    });
    expect(Array.from(s.sunAz)).toEqual([0, 0, 12346]);
    expect(Array.from(s.sunEl)).toEqual([-8999, 0, 4568]);
    expect(Array.from(s.earthAz)).toEqual([18000, 9050, 27025]);
    expect(Array.from(s.earthEl)).toEqual([1234, -123, 8999]);
  });

  it('refuses a buffer of the wrong size', () => {
    expect(
      decodeHorizons(new ArrayBuffer(10), { siteId: 'x', startMs: 0, stepMs: STEP, count: 2 }),
    ).toBeNull();
  });
});

describe('horizonsAzEl', () => {
  const s = series({
    sunAz: [350, 10, 20],
    sunEl: [1, 3, 5],
    earthAz: [100, 100, 100],
    earthEl: [-2, -1, 0],
  });

  it('gives the stored sample on a step and interpolates between steps', () => {
    expect(horizonsAzEl(s, 'sun', START)).toEqual({ azimuth: 350, elevation: 1 });
    const half = horizonsAzEl(s, 'sun', START + STEP / 2);
    expect(half?.elevation).toBeCloseTo(2, 9);
    // 350° to 10° goes the short way round, through 0°.
    expect(half?.azimuth).toBeCloseTo(0, 9);
    expect(horizonsAzEl(s, 'earth', START + STEP * 1.5)?.elevation).toBeCloseTo(-0.5, 9);
  });

  it('gives null outside the series', () => {
    expect(horizonsAzEl(s, 'sun', START - 1)).toBeNull();
    expect(horizonsAzEl(s, 'sun', START + 2 * STEP + 1)).toBeNull();
    expect(horizonsAzEl(s, 'sun', START + 2 * STEP)).toEqual({ azimuth: 20, elevation: 5 });
  });
});

describe('pointAt', () => {
  it('is the inverse of azimuthElevationOf, at the pole region and far from it', () => {
    for (const site of [
      { lat: -84.79, lon: 29.2 },
      { lat: -80.13, lon: 1.44 },
      { lat: 18.5623, lon: 61.8103 },
    ]) {
      for (const [azimuth, elevation] of [
        [0, 0],
        [95.7, 11.8],
        [283.25, -3.76],
        [180, 45],
      ] as const) {
        const back = azimuthElevationOf(pointAt(site, azimuth, elevation, 384_400), site);
        expect(back.elevation).toBeCloseTo(elevation, 6);
        expect(((back.azimuth - azimuth + 540) % 360) - 180).toBeCloseTo(0, 6);
      }
    }
  });

  it('puts the point at the given distance from the site', () => {
    const site = { lat: -84.79, lon: 29.2 };
    expect(distanceFromSite(pointAt(site, 95.7, 11.8, 384_400), site)).toBeCloseTo(384_400, 3);
  });
});

describe('horizonsSky', () => {
  it('takes the direction from Horizons and the distance from our engine for the hour', () => {
    const site = { lat: -84.79, lon: 29.2 };
    const s = series({ sunAz: [90, 90], sunEl: [3, 3], earthAz: [10, 10], earthEl: [-0.5, -0.5] });
    const sky = horizonsSky(s, site, START);
    if (!sky) throw new Error('covered');
    expect(azimuthElevationOf(sky.earth, site).elevation).toBeCloseTo(-0.5, 6);
    const engine = skyAtHour(START / HOUR);
    expect(distanceFromSite(sky.sun, site)).toBeCloseTo(distanceFromSite(engine.sun, site), 0);
    expect(distanceFromSite(sky.earth, site)).toBeCloseTo(distanceFromSite(engine.earth, site), 3);
    expect(engineDistanceKm(site, 'earth', START + 30 * 60_000)).toBe(
      distanceFromSite(engine.earth, site),
    );
  });
});

describe('siteSamples', () => {
  const site = { lat: -80.13, lon: 1.44 };
  const values = Array.from({ length: 13 }, (_, i) => i);
  const s = series({
    sunAz: values.map(() => 90),
    sunEl: values.map((i) => i),
    earthAz: values.map(() => 0),
    earthEl: values.map(() => 5),
  });

  it('uses every 10-minute Horizons sample where it covers, and the engine hourly elsewhere', () => {
    const range = { start: START - HOUR, end: START + 3 * HOUR };
    const { samples, fromHorizons } = siteSamples(s, site, range);
    // The hour before the series from the engine, then all 13 stored samples (START to +120 min).
    expect(samples.map((sample) => sample.t)).toEqual([
      START - HOUR,
      ...Array.from({ length: 13 }, (_, i) => START + i * STEP),
    ]);
    expect(fromHorizons).toBe(13);
    // Each sample says how long it stands for: an hour (the engine) or 10 minutes (Horizons).
    expect(samples[0]?.stepMs).toBeUndefined();
    expect(samples.slice(1).every((sample) => sample.stepMs === STEP)).toBe(true);
    const at = (i: number) => {
      const sample = samples[i];
      if (!sample) throw new Error('missing');
      return azimuthElevationOf(sample.sun, site).elevation;
    };
    expect(at(1)).toBeCloseTo(0, 6);
    expect(at(2)).toBeCloseTo(1, 6);
    expect(at(7)).toBeCloseTo(6, 6);
    expect(at(13)).toBeCloseTo(12, 6);
    // The hour before the series comes from the engine, unchanged.
    expect(samples[0]?.sun).toEqual(hourlySky({ start: START - HOUR, end: START })[0]?.sun);
  });

  it('stops an engine hour where the series starts, so no time is counted twice', () => {
    const range = { start: START - 30 * 60_000, end: START + 20 * 60_000 };
    const { samples } = siteSamples(s, site, range);
    // The range starts mid-hour: the engine has no whole hour before the series, so the first
    // sample is the series' own.
    expect(samples.map((sample) => sample.t)).toEqual([START, START + STEP]);
  });

  it('is the engine alone without a series', () => {
    const range = { start: START, end: START + 2 * HOUR };
    expect(siteSamples(null, site, range)).toEqual({
      samples: hourlySky(range),
      fromHorizons: 0,
    });
  });

  it('says where a range’s positions came from', () => {
    expect(positionsSource(s, { start: START, end: START + HOUR })).toBe('horizons');
    expect(positionsSource(s, { start: START - HOUR, end: START + HOUR })).toBe('mixed');
    expect(positionsSource(s, { start: START + 3 * HOUR, end: START + 4 * HOUR })).toBe('engine');
    expect(positionsSource(null, { start: START, end: START + HOUR })).toBe('engine');
  });
});

describe('shareAbove (the upper limb, docs/LANDER_RULES.md "Is it up: the upper limb")', () => {
  // Made-up: Earth at −1.5°, −0.5°, 2°, 5° elevation, azimuths 0°, 90°, 180°, 270°; the Sun at
  // −0.4°, −0.2°, −0.1°, 0°. The Earth's angular radius is about 0.9–1.0°, the Sun's about 0.27°.
  const s = series({
    sunAz: [0, 0, 0, 0],
    sunEl: [-0.4, -0.2, -0.1, 0],
    earthAz: [0, 90, 180, 270],
    earthEl: [-1.5, -0.5, 2, 5],
  });
  const site = { lat: -84.79, lon: 29.2 };
  const all = { start: START, end: START + 4 * STEP };

  it('counts samples whose upper limb is above a flat horizon, centre below 0° included', () => {
    // −0.5° counts (its limb is up); −1.5° does not.
    expect(shareAbove(s, 'earth', site, all)).toEqual({ pct: 75, samples: 4 });
    // −0.2° and −0.1° count; −0.4° is more than the Sun's radius below.
    expect(shareAbove(s, 'sun', site, all)).toEqual({ pct: 75, samples: 4 });
  });

  it('uses the terrain horizon in each direction when given', () => {
    // Terrain 3° high to the south and west: the 2° sample (south) stays behind it even with its
    // radius; the 5° sample (west) and the −0.5° one (east, flat) stay up.
    const terrain = (azimuth: number) => (azimuth >= 180 ? 3 : 0);
    expect(shareAbove(s, 'earth', site, all, terrain)).toEqual({ pct: 50, samples: 4 });
  });

  it('is null when the series does not cover the range', () => {
    expect(shareAbove(s, 'earth', site, { start: START, end: START + 5 * STEP })).toBeNull();
    expect(shareAbove(s, 'earth', site, { start: START - STEP, end: START + STEP })).toBeNull();
  });

  it('defaults to calendar 2027', () => {
    expect(YEAR_RANGE).toEqual({ start: Date.UTC(2027, 0, 1), end: Date.UTC(2028, 0, 1) });
  });
});

describe('readHorizonsIndex and loadHorizonsSeries', () => {
  const raw = {
    version: 1,
    sourceId: 'SRC-055',
    fetchedUtc: 'test-load',
    startUtc: '2026-11-01T00:00:00Z',
    stepMinutes: 10,
    count: 3,
    sites: [{ id: 'im1', file: 'im1.bin', lat: -80.13, lonEast: 1.44, bytes: 24 }],
  };

  it('reads a valid index and refuses a broken one', () => {
    expect(readHorizonsIndex(raw)?.startMs).toBe(START);
    expect(readHorizonsIndex({ ...raw, version: 2 })).toBeNull();
    expect(readHorizonsIndex({ ...raw, sites: [{ ...raw.sites[0], bytes: 23 }] })).toBeNull();
    expect(
      readHorizonsIndex({ ...raw, sites: [{ ...raw.sites[0], file: '../x.bin' }] }),
    ).toBeNull();
    expect(readHorizonsIndex(undefined)).toBeNull();
  });

  it('loads a site file once, and refuses a stale or wrong-sized one', async () => {
    const index = readHorizonsIndex(raw) as HorizonsIndex;
    const bytes = encodeHorizons({
      sunAz: [1, 2, 3],
      sunEl: [1, 2, 3],
      earthAz: [1, 2, 3],
      earthEl: [1, 2, 3],
    });
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(bytes.slice().buffer));
    const site = { id: 'im1', lat: -80.13, lon: 1.44 };
    const loaded = await loadHorizonsSeries(site, index, fetchImpl);
    expect(loaded?.count).toBe(3);
    await loadHorizonsSeries(site, index, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toMatch(/data\/horizons\/im1\.bin$/);
    // Moved site: the file no longer describes it.
    expect(await loadHorizonsSeries({ ...site, lat: -80.2 }, index, fetchImpl)).toBeNull();
    const short = readHorizonsIndex({ ...raw, fetchedUtc: 'test-short' }) as HorizonsIndex;
    const tooShort = vi.fn<typeof fetch>(async () => new Response(new ArrayBuffer(8)));
    expect(await loadHorizonsSeries(site, short, tooShort)).toBeNull();
    expect(await loadHorizonsSeries({ ...site, id: 'none' }, index, fetchImpl)).toBeNull();
  });

  it('tries again after a failed load', async () => {
    const index = readHorizonsIndex({ ...raw, fetchedUtc: 'test-retry' }) as HorizonsIndex;
    const bytes = encodeHorizons({
      sunAz: [1, 2, 3],
      sunEl: [1, 2, 3],
      earthAz: [1, 2, 3],
      earthEl: [1, 2, 3],
    });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response(bytes.slice().buffer));
    const site = { id: 'im1', lat: -80.13, lon: 1.44 };
    expect(await loadHorizonsSeries(site, index, fetchImpl)).toBeNull();
    expect((await loadHorizonsSeries(site, index, fetchImpl))?.count).toBe(3);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
