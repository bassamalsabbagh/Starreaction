import { describe, expect, it } from 'vitest';
import { DEFAULT_DEMO_MISSION, DEMO_MISSIONS } from '../../../src/data/demoData';
import { checkPoint, nearestSite, pointLabel } from '../../../src/data/pointCheck';
import { SITES, findSite } from '../../../src/services/sites';
import { hourlySky, sampledSpan, siteSky } from '../../../src/utils/skyVisibility';
import { dayCentre, rangeAround } from '../../../src/utils/time';

const RANGE = rangeAround(dayCentre(Date.parse('2026-11-15T00:00:00Z')));
const SAMPLES = hourlySky(sampledSpan(RANGE));
const missionB = DEMO_MISSIONS.find((mission) => mission.id === 'demo-mission-b');
if (!missionB) throw new Error('Demo Mission B missing');

describe('pointLabel', () => {
  it('names a point by its coordinates', () => {
    expect(pointLabel({ lat: -85.5, lon: 31 })).toBe('85.5° S, 31.0° E');
  });
});

describe('nearestSite', () => {
  it('finds the closest real landing site and its distance, 0 km at the site itself', () => {
    const odysseus = SITES[0];
    if (!odysseus) throw new Error('no sites');
    expect(nearestSite({ lat: odysseus.lat, lon: odysseus.lon })).toEqual({
      site: odysseus,
      distanceKm: 0,
    });
    // A degree of latitude on the Moon is about 30 km.
    const near = nearestSite({ lat: odysseus.lat + 1, lon: odysseus.lon });
    expect(near?.site).toBe(odysseus);
    expect(near?.distanceKm).toBe(30);
  });

  it('searches the real sites by default: Mare Crisium is nearest to 20° N, 40° E', () => {
    expect(nearestSite({ lat: 20.25, lon: 40.5 })?.site).toBe(findSite('bg1'));
  });

  it('is null with no sites', () => {
    expect(nearestSite({ lat: 0, lon: 0 }, [])).toBeNull();
  });
});

describe('checkPoint', () => {
  it('gives a point on a site the same sky as the site', () => {
    const odysseus = SITES[0];
    if (!odysseus) throw new Error('no sites');
    const result = checkPoint(odysseus, DEFAULT_DEMO_MISSION, SAMPLES, RANGE);
    expect(result.assessment.sky).toEqual(siteSky(SAMPLES, odysseus, DEFAULT_DEMO_MISSION, RANGE));
    expect(result.nearest?.site).toBe(odysseus);
  });

  it('passes on the near side for Mission A, with a best window', () => {
    const result = checkPoint({ lat: 12.4, lon: -31.8 }, DEFAULT_DEMO_MISSION, SAMPLES, RANGE);
    expect(result.assessment.suitable).toBe(true);
    expect(result.assessment.bestWindow).not.toBeNull();
  });

  it('fails comms on the far side without a relay, and passes with one', () => {
    const farSide = { lat: 0, lon: 180 };
    const noRelay = checkPoint(farSide, DEFAULT_DEMO_MISSION, SAMPLES, RANGE);
    expect(noRelay.assessment.checks.find((check) => check.id === 'earth')?.passes).toBe(false);
    expect(noRelay.assessment.suitable).toBe(false);
    const relay = checkPoint(farSide, missionB, SAMPLES, RANGE);
    expect(relay.assessment.checks.find((check) => check.id === 'earth')?.passes).toBe(true);
    expect(relay.assessment.checks.find((check) => check.id === 'earth')?.detail).toMatch(
      /^Relay: /,
    );
  });
});
