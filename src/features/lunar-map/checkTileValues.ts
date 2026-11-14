/** The check tiles' numbers, shared by Results, the Compare cards and the full comparison. */
import type { SkyAssessment } from '../../data/demoData';

export type TileKey = 'sun' | 'earth' | 'both';

/** "7.0 days" from hours: one decimal. */
export function daysFromHours(hours: number): string {
  return `${(hours / 24).toFixed(1)} days`;
}

/** The three tiles' numbers, in hours (the tooltip shows them), by key. */
export function tileHours(assessment: SkyAssessment): Record<TileKey, number> {
  const { sky } = assessment;
  return { sun: sky.sunHours, earth: sky.earthHours, both: sky.bothHours };
}
