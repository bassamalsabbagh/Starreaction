/**
 * The night-survival block's words (docs/LANDER_RULES.md, "Lander night survival"): a lander value
 * with its unit, the verdict from `nightSurvival`, and the battery needed here. The verdict and the
 * numbers come from src/services/landers.ts; this only says them. Pure.
 */
import { formatHours } from '../../utils/time';
import { BATTERY_WH_PER_KG } from '../../data/powerCheck';
import {
  LANDER_FIELD_LABEL,
  LANDER_FIELD_UNIT,
  batteryNeededHere,
  type LanderFieldName,
  type LanderValue,
  type NightSurvival,
} from '../../services/landers';

/** "1,554 Wh", "12°", or "not published". */
export function landerValueText(field: LanderFieldName, value: LanderValue): string {
  if (value.value === null) return 'not published';
  const unit = LANDER_FIELD_UNIT[field];
  const number = value.value.toLocaleString('en-US');
  return unit === '°' ? `${number}°` : `${number} ${unit}`;
}

/** Hours to one decimal, rounded down, so a battery never reads as lasting longer than it does. */
const tenthsDown = (hours: number) => Math.floor(hours * 10 + 1e-9) / 10;

/** "Survives", "Doesn't survive", or "Can't judge: not published". */
export function verdictTitle(result: NightSurvival): string {
  if (result.kind === 'cant-judge') return result.reason;
  return result.kind === 'survives' ? 'Survives' : 'Doesn’t survive';
}

/** The lander values behind the verdict; `heaterAssumed` when the night load's tag is A. */
export interface VerdictValues {
  batteryWh: number | null;
  heaterW: number | null;
  heaterAssumed?: boolean;
}

/** "1554 Wh ÷ 100 W night load (A: team assumption)". */
function division(values: VerdictValues): string {
  const assumed = values.heaterAssumed ? ' (A: team assumption)' : '';
  return `${values.batteryWh ?? 0} Wh ÷ ${values.heaterW ?? 0} W night load${assumed}`;
}

/**
 * "battery lasts 15.5 h (1554 Wh ÷ 100 W night load) vs longest darkness at least 43 h"; when the
 * night runs past the dates checked, what was seen and why it can't be judged; or which values are
 * missing.
 */
export function verdictDetail(result: NightSurvival, values: VerdictValues): string {
  if (result.kind === 'cant-judge') {
    switch (result.cause) {
      case 'night-longer':
        return `battery lasts ${tenthsDown(result.batteryHours ?? 0)} h (${division(values)}) vs at least ${formatHours(result.darkHours ?? 0)} of darkness seen; the night runs past the dates checked`;
      case 'not-published':
        return `Missing: ${result.missing.map((field) => LANDER_FIELD_LABEL[field]).join(', ')}.`;
      case 'no-lander':
        return 'No lander data is loaded for this site.';
    }
  }
  const dark = `${result.darkAtLeast ? 'at least ' : ''}${formatHours(result.darkHours ?? 0)}`;
  return `battery lasts ${tenthsDown(result.batteryHours)} h (${division(values)}) vs longest darkness ${dark}`;
}

/**
 * "Battery needed here: 860 Wh (6.1 kg at 143 Wh/kg), for your 20 W night load (set in Power
 * details) over 43 h of darkness": the user's own slider value × the darkness, rounded up, so it
 * never reads as less than needed (and never as the lander's own need).
 */
export function batteryNeededText(
  loadW: number,
  dark: { hours: number; atLeast: boolean },
  within: string,
): string {
  if (dark.hours === 0) return `Battery needed here: none, no darkness ${within}.`;
  const { wh, kg } = batteryNeededHere(loadW, dark.hours);
  const atLeast = dark.atLeast ? 'at least ' : '';
  const whText = Math.ceil(wh - 1e-9).toLocaleString('en-US');
  const kgText = (Math.ceil(kg * 10 - 1e-9) / 10).toFixed(1);
  return `Battery needed here: ${atLeast}${whText} Wh (${atLeast}${kgText} kg at ${BATTERY_WH_PER_KG} Wh/kg), for a ${loadW} W night load over ${atLeast}${formatHours(dark.hours)} of darkness.`;
}

/** One line on where a tag's value comes from, for the hover: the tag's meaning and its source. */
export function tagSource(value: LanderValue): string {
  const meaning: Record<LanderValue['tag'], string> = {
    S: 'S: from an opened source',
    'S*': 'S*: seen on a secondary page',
    D: 'D: derived',
    A: 'A: team assumption',
    'not published': 'Not published: no source gives it',
  };
  const host = value.source ? value.source.replace(/^https?:\/\//, '').split('/')[0] : null;
  return host ? `${meaning[value.tag]} (${host})` : meaning[value.tag];
}

/** "15.5 h", or a dash when the battery or night load is not published. */
export function batteryLastsText(result: NightSurvival): string {
  if (result.kind === 'cant-judge') {
    return result.cause === 'night-longer' ? `${tenthsDown(result.batteryHours ?? 0)} h` : '–';
  }
  return `${tenthsDown(result.batteryHours)} h`;
}

/**
 * The one verdict line. With no night in the dates nothing can be judged, so it never says
 * "Survives" then.
 */
export function verdictLine(
  result: NightSurvival,
  dark: { hours: number; atLeast: boolean },
): { kind: 'survives' | 'doesnt' | 'cant-judge'; text: string; short: string } {
  const cant = (text: string) => ({ kind: 'cant-judge' as const, text, short: "Can't judge" });
  if (dark.hours === 0) return cant("No night in these dates: can't judge");
  if (result.kind === 'cant-judge') {
    return cant(
      result.cause === 'night-longer'
        ? "Can't judge: the night runs past the dates checked"
        : result.cause === 'no-lander'
          ? "Can't judge: lander data not loaded"
          : "Can't judge: battery or night load not published",
    );
  }
  const night = `${result.darkAtLeast ? 'at least ' : ''}${formatHours(result.darkHours)}`;
  if (result.kind === 'survives') {
    return { kind: 'survives', text: `Survives the ${night} night`, short: 'Survives' };
  }
  return {
    kind: 'doesnt',
    text: `Does not survive: battery lasts ${tenthsDown(result.batteryHours)} h, night is ${night}`,
    short: 'Does not survive',
  };
}
