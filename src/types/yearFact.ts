import type { DataStatus } from '../services/sites';

/**
 * One of a site's "over the year" values (docs/LANDER_RULES.md, "Light, water and Earth over the
 * year"): what it is, its value or why there is none, its data-status tag and its source.
 */
export interface YearFact {
  readonly id: 'light' | 'water' | 'earth';
  readonly label: string;
  readonly value: string;
  readonly status: DataStatus;
  readonly source: string;
}
