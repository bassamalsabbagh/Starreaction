/**
 * The Power check (docs/LANDER_RULES.md, "Power check"): Miral's Moon power lab as a simplified
 * teaching model. Panel power from the Sun's height now, and the battery needed to keep a heater on
 * through the longest night this month. Information only: it never changes a check. Pure.
 */

/** Solar irradiance at the Moon, W/m² (DATA_SOURCES SRC-044, NASA Moon Fact Sheet: 1361.0). */
export const SOLAR_IRRADIANCE_W_M2 = 1361;
/** Solar cell efficiency (SRC-045: "a nominal efficiency of 30%"). */
export const CELL_EFFICIENCY = 0.3;
/**
 * Battery specific energy, Wh/kg: derived from LuSEE-Night's planned 7160 Wh battery of 50 kg
 * (SRC-046; conflicts 13 and 14). Using it for every mission is a team assumption.
 */
export const BATTERY_WH_PER_KG = 143;

export type PanelType = 'flat' | 'standing';

/** Slider ranges and their teaching defaults (agreed; not mission data). */
export const POWER_SLIDERS = {
  areaM2: { min: 0.5, max: 4, step: 0.1, initial: 1 },
  heaterW: { min: 5, max: 100, step: 1, initial: 20 },
  batteryKg: { min: 5, max: 200, step: 1, initial: 30 },
} as const;

/**
 * How much of the sunlight a panel catches: a flat panel sin(height), a standing panel turned to
 * face the Sun cos(height). Nothing while the Sun is down.
 */
export function angleFactor(panel: PanelType, sunHeightDeg: number): number {
  if (sunHeightDeg <= 0) return 0;
  const height = (Math.min(sunHeightDeg, 90) * Math.PI) / 180;
  return panel === 'flat' ? Math.sin(height) : Math.cos(height);
}

/** Panel power now, W: 1361 W/m² × area × 0.30 × angle factor. */
export function panelWatts(panel: PanelType, areaM2: number, sunHeightDeg: number): number {
  return SOLAR_IRRADIANCE_W_M2 * areaM2 * CELL_EFFICIENCY * angleFactor(panel, sunHeightDeg);
}

/** Battery mass that keeps the heater on through the night, kg: W × h ÷ 143 Wh/kg. A minimum. */
export function batteryNeededKg(heaterW: number, nightHours: number): number {
  return (heaterW * nightHours) / BATTERY_WH_PER_KG;
}

export interface PowerCheckInput {
  panel: PanelType;
  areaM2: number;
  heaterW: number;
  batteryKg: number;
  sunHeightDeg: number;
  nightHours: number;
}

export interface PowerCheckResult {
  panelW: number;
  neededKg: number;
  survives: boolean;
  /** How much more battery is needed, kg, rounded up to 0.1 (0 when it survives). */
  shortKg: number;
}

export function powerCheck(input: PowerCheckInput): PowerCheckResult {
  const neededKg = batteryNeededKg(input.heaterW, input.nightHours);
  const survives = input.batteryKg >= neededKg - 1e-9;
  return {
    panelW: panelWatts(input.panel, input.areaM2, input.sunHeightDeg),
    neededKg,
    survives,
    shortKg: survives ? 0 : Math.ceil((neededKg - input.batteryKg) * 10 - 1e-9) / 10,
  };
}
