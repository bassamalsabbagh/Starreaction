import { describe, expect, it } from 'vitest';
import {
  BATTERY_WH_PER_KG,
  CELL_EFFICIENCY,
  POWER_SLIDERS,
  SOLAR_IRRADIANCE_W_M2,
  angleFactor,
  batteryNeededKg,
  panelWatts,
  powerCheck,
} from '../../../src/data/powerCheck';

describe('Power check (LANDER_RULES "Power check")', () => {
  it('uses the sourced constants and the agreed teaching sliders', () => {
    expect(SOLAR_IRRADIANCE_W_M2).toBe(1361);
    expect(CELL_EFFICIENCY).toBe(0.3);
    expect(BATTERY_WH_PER_KG).toBe(143);
    expect(POWER_SLIDERS).toEqual({
      areaM2: { min: 0.5, max: 4, step: 0.1, initial: 1 },
      heaterW: { min: 5, max: 100, step: 1, initial: 20 },
      batteryKg: { min: 5, max: 200, step: 1, initial: 30 },
    });
  });

  it('gives a flat panel sin(height) and a standing one facing the Sun cos(height)', () => {
    expect(angleFactor('flat', 30)).toBeCloseTo(0.5, 12);
    expect(angleFactor('standing', 30)).toBeCloseTo(Math.cos(Math.PI / 6), 12);
    // At the pole the Sun skims the horizon: a standing panel catches almost all of it.
    expect(angleFactor('standing', 2)).toBeGreaterThan(0.99);
    expect(angleFactor('flat', 2)).toBeLessThan(0.04);
    // Not the team file's factor of 1: a standing panel catches little when the Sun is high.
    expect(angleFactor('standing', 80)).toBeLessThan(0.2);
  });

  it('gives no power while the Sun is down', () => {
    expect(angleFactor('flat', 0)).toBe(0);
    expect(angleFactor('standing', -3)).toBe(0);
    expect(panelWatts('standing', 2, -1)).toBe(0);
  });

  it('works out panel watts: 1361 × area × 0.30 × angle factor', () => {
    expect(panelWatts('flat', 1, 30)).toBeCloseTo(1361 * 0.3 * 0.5, 9);
    expect(panelWatts('standing', 2, 0.0001)).toBeCloseTo(1361 * 2 * 0.3, 2);
  });

  it('works out the battery: heater W × night hours ÷ 143 Wh/kg', () => {
    expect(batteryNeededKg(20, 354)).toBeCloseTo((20 * 354) / 143, 9);
    expect(batteryNeededKg(50, 0)).toBe(0);
  });

  it('says it survives the night, or how much more battery it needs (rounded up)', () => {
    const base = { panel: 'flat' as const, areaM2: 1, sunHeightDeg: 10 };
    // 20 W for 354 h needs 49.5 kg: 30 kg is short by 19.6 kg (19.51 rounded up).
    const short = powerCheck({ ...base, heaterW: 20, batteryKg: 30, nightHours: 354 });
    expect(short.survives).toBe(false);
    expect(short.shortKg).toBe(19.6);
    const enough = powerCheck({ ...base, heaterW: 20, batteryKg: 50, nightHours: 354 });
    expect(enough.survives).toBe(true);
    expect(enough.shortKg).toBe(0);
    // No night: nothing to survive.
    expect(powerCheck({ ...base, heaterW: 100, batteryKg: 5, nightHours: 0 }).survives).toBe(true);
  });
});
