import { describe, expect, it } from 'vitest';
import { readShareHash, shareHash } from '../../../src/utils/shareLink';

const known = { missionIds: ['demo-mission-a', 'demo-mission-b'], siteIds: ['demo-site-alpha'] };

describe('share link', () => {
  it('writes the mission, site and exact time, and reads them back', () => {
    const time = Date.parse('2026-11-15T02:00:00Z');
    const hash = shareHash({
      missionId: 'demo-mission-b',
      siteId: 'demo-site-alpha',
      time,
    });
    expect(hash).toBe(
      '#mission=demo-mission-b&site=demo-site-alpha&t=2026-11-15T02%3A00%3A00.000Z',
    );
    expect(readShareHash(hash, known)).toEqual({
      missionId: 'demo-mission-b',
      siteId: 'demo-site-alpha',
      time,
    });
  });

  it('leaves out anything unknown or malformed, so the app keeps its defaults', () => {
    expect(readShareHash('#mission=custom-1&site=nowhere&t=soon', known)).toEqual({});
    expect(readShareHash('', known)).toEqual({});
    expect(
      readShareHash(shareHash({ missionId: 'demo-mission-a', siteId: null, time: 0 }), known),
    ).toEqual({ missionId: 'demo-mission-a', time: 0 });
  });

  it('carries a point checked anywhere on the Moon, and drops one out of range', () => {
    const hash = shareHash({
      missionId: 'demo-mission-a',
      siteId: null,
      point: { lat: -85.512, lon: 31 },
      time: 0,
    });
    expect(hash).toContain('&at=-85.51%2C31.00&');
    expect(readShareHash(hash, known)).toEqual({
      missionId: 'demo-mission-a',
      point: { lat: -85.51, lon: 31 },
      time: 0,
    });
    expect(readShareHash('#at=95,0', known)).toEqual({});
    expect(readShareHash('#at=nowhere', known)).toEqual({});
  });
});
