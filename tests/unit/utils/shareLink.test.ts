import { describe, expect, it } from 'vitest';
import { readShareHash, shareHash, type SharedMission } from '../../../src/utils/shareLink';

const known = { siteIds: ['im1'] };
// Made-up test values (not any lander's).
const MISSION: SharedMission = {
  name: 'Test rover',
  minSunElevationDeg: 5,
  minEarthElevationDeg: 2.5,
  daysNeeded: 3,
  hasRelay: true,
};

describe('share link', () => {
  it('writes the mission, site and exact time, and reads them back', () => {
    const time = Date.parse('2026-11-15T02:00:00Z');
    const hash = shareHash({ mission: MISSION, siteId: 'im1', time });
    expect(hash).toBe(
      '#name=Test+rover&sun=5&earth=2.5&days=3&relay=1&site=im1&t=2026-11-15T02%3A00%3A00.000Z',
    );
    expect(readShareHash(hash, known)).toEqual({ mission: MISSION, siteId: 'im1', time });
  });

  it('leaves out anything unknown, incomplete or malformed, so the app keeps its defaults', () => {
    expect(readShareHash('#name=X&sun=5&site=nowhere&t=soon', known)).toEqual({});
    expect(readShareHash('#name=X&sun=a&earth=1&days=1', known)).toEqual({});
    expect(readShareHash('', known)).toEqual({});
    expect(readShareHash(shareHash({ siteId: null, time: 0 }), known)).toEqual({ time: 0 });
  });

  it('carries the dates picked in the wizard, and drops impossible ones', () => {
    const dates = { startMs: Date.UTC(2026, 11, 12), stopMs: Date.UTC(2026, 11, 25) };
    const hash = shareHash({ siteId: 'im1', time: 0, dates });
    expect(hash).toContain('&from=2026-12-12&to=2026-12-25&');
    expect(readShareHash(hash, known).dates).toEqual(dates);
    expect(readShareHash('#from=2026-02-30&to=2026-03-02', known).dates).toBeUndefined();
    expect(readShareHash('#from=2026-12-25&to=2026-12-12', known).dates).toBeUndefined();
  });

  it('carries a point checked anywhere on the Moon, and drops one out of range', () => {
    const hash = shareHash({ siteId: null, point: { lat: -85.512, lon: 31 }, time: 0 });
    expect(hash).toContain('at=-85.51%2C31.00&');
    expect(readShareHash(hash, known)).toEqual({ point: { lat: -85.51, lon: 31 }, time: 0 });
    expect(readShareHash('#at=95,0', known)).toEqual({});
    expect(readShareHash('#at=nowhere', known)).toEqual({});
  });
});
