// The team equation sheet's power tests S3 and S4 (docs/team, "New power-related tests", from
// Miral's equations M4 and M8), run against the app's own Power check code.
import { describe, expect, it } from 'vitest';
import {
  batteryNeededKg,
  CELL_EFFICIENCY,
  panelWatts,
  SOLAR_IRRADIANCE_W_M2,
} from '../../../src/data/powerCheck';
import { batteryNeededHere } from '../../../src/services/landers';

describe('team tests S3 and S4', () => {
  it('S3: a 1 m² panel at 0.30 under 1361 W/m², facing the Sun, gives 408.3 W', () => {
    expect(SOLAR_IRRADIANCE_W_M2 * 1 * CELL_EFFICIENCY).toBeCloseTo(408.3, 1);
    // A standing panel turned to the Sun with the Sun just above the horizon faces it squarely.
    expect(panelWatts('standing', 1, 0.001)).toBeCloseTo(408.3, 1);
  });

  it('S3: the same panel lying flat with the Sun 1.5° up gives about 10.7 W', () => {
    expect(panelWatts('flat', 1, 1.5)).toBeCloseTo(10.7, 1);
  });

  it('S4: a 20 W heater through 328 h of darkness needs 6560 Wh, about 45.9 kg', () => {
    const needed = batteryNeededHere(20, 328);
    expect(needed.wh).toBe(6560);
    expect(needed.kg).toBeCloseTo(45.9, 1);
    expect(batteryNeededKg(20, 328)).toBeCloseTo(45.9, 1);
  });
});
