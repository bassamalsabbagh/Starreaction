import { describe, expect, it } from 'vitest';
import {
  batteryNeededText,
  landerValueText,
  verdictDetail,
  verdictTitle,
} from '../../../../src/features/lunar-map/nightSurvivalText';
import { findLander, nightSurvival } from '../../../../src/services/landers';
import { findSite } from '../../../../src/services/sites';
import { bodyNow } from '../../../../src/utils/riseSet';
import { hourlySky, longestDarkHours } from '../../../../src/utils/skyVisibility';
import { HOUR_MS } from '../../../../src/utils/time';

describe('the night-survival words', () => {
  const nova = findLander('nova-c');
  const values = { batteryWh: 1554, heaterW: 100, heaterAssumed: true };

  it('says Nova-C survives 10 h of darkness and not 43 h: 1554 Wh ÷ 100 W = 15.5 h', () => {
    const short = nightSurvival(nova, { hours: 10, atLeast: false });
    expect(verdictTitle(short)).toBe('Survives');
    expect(verdictDetail(short, values)).toBe(
      'battery lasts 15.5 h (1554 Wh ÷ 100 W night load (A: team assumption)) vs longest darkness 10 h',
    );
    const long = nightSurvival(nova, { hours: 43, atLeast: true });
    expect(verdictTitle(long)).toBe('Doesn’t survive');
    expect(verdictDetail(long, values)).toBe(
      'battery lasts 15.5 h (1554 Wh ÷ 100 W night load (A: team assumption)) vs longest darkness at least 43 h',
    );
  });

  it('can’t judge a battery that outlasts darkness cut by the edge of the dates checked', () => {
    const cut = nightSurvival(nova, { hours: 10, atLeast: true });
    expect(verdictTitle(cut)).toBe("Can't judge: the night runs past the dates checked");
    expect(verdictDetail(cut, values)).toBe(
      'battery lasts 15.5 h (1554 Wh ÷ 100 W night load (A: team assumption)) vs at least 10 h of darkness seen; the night runs past the dates checked',
    );
  });

  it('IM-1 over one day that ends in darkness: "Can\'t judge", not "Survives"', () => {
    const im1 = findSite('im1');
    if (!im1) throw new Error('no IM-1');
    // The next sunset at IM-1 after a fixed moment, from the real Sun.
    const from = Date.UTC(2026, 10, 15);
    let sunset: number | null = null;
    for (let t = from; sunset === null && t < from + 60 * 24 * HOUR_MS; t += 24 * HOUR_MS) {
      const sun = bodyNow(im1, 'sun', t);
      if (sun.up && sun.next?.kind === 'set') sunset = sun.next.at;
    }
    if (sunset === null) throw new Error('no sunset found');
    // One day: 12 hours of light, then 12 hours of the night, cut by the day's end.
    const start = Math.floor(sunset / HOUR_MS) * HOUR_MS - 12 * HOUR_MS;
    const day = { start, end: start + 24 * HOUR_MS };
    const dark = longestDarkHours(hourlySky(day), im1, day);
    expect(dark.atLeast).toBe(true);
    expect(dark.hours).toBeLessThan(15.5);
    const result = nightSurvival(nova, dark);
    expect(verdictTitle(result)).toBe("Can't judge: the night runs past the dates checked");
    expect(verdictTitle(result)).not.toBe('Survives');
  });

  it('names the missing values by their labels when it can’t judge', () => {
    const result = nightSurvival(findLander('blue-ghost-1'), { hours: 10, atLeast: false });
    expect(verdictTitle(result)).toBe("Can't judge: not published");
    expect(verdictDetail(result, { batteryWh: null, heaterW: null })).toBe(
      'Missing: Battery, Night load (heater + electronics).',
    );
    const none = nightSurvival(undefined, { hours: 1, atLeast: false });
    expect(verdictTitle(none)).toBe("Can't judge: lander data not loaded");
    expect(verdictDetail(none, { batteryWh: null, heaterW: null })).toBe(
      'No lander data is loaded for this site.',
    );
  });

  it('works out the battery needed here from your own slider’s watts, rounded up', () => {
    expect(batteryNeededText(20, { hours: 43, atLeast: false }, 'in this month')).toBe(
      'Battery needed here: 860 Wh (6.1 kg at 143 Wh/kg), for your 20 W night load (set in Power details) over 43 h of darkness.',
    );
    expect(batteryNeededText(20, { hours: 0, atLeast: false }, 'in these dates')).toBe(
      'Battery needed here: none, no darkness in these dates.',
    );
  });

  it('writes values with their units, or "not published"', () => {
    if (!nova) throw new Error('no Nova-C');
    expect(landerValueText('batteryWh', nova.fields.batteryWh)).toBe('1,554 Wh');
    expect(landerValueText('panelAreaM2', nova.fields.panelAreaM2)).toBe('not published');
    const ch3 = findLander('chandrayaan-3');
    if (!ch3) throw new Error('no Chandrayaan-3');
    expect(landerValueText('touchdownSlopeDeg', ch3.fields.touchdownSlopeDeg)).toBe('12°');
  });
});
