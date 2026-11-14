/**
 * The winner of each card row (Sun up, Earth in view, Sun + Earth together): the place with the
 * most days among those that pass, ties by name. A row with fewer than two places that pass, or
 * where they all tie, has no winner (so "Best" never marks a tie). Pure.
 */
import type { CompareEntry } from '../../data/demoData';
import { tileHours, type TileKey } from '../lunar-map/checkTileValues';

const KEYS: readonly TileKey[] = ['sun', 'earth', 'both'];

export function bestTiles(entries: readonly CompareEntry[]): Map<TileKey, ReadonlySet<string>> {
  const winners = new Map<TileKey, ReadonlySet<string>>();
  for (const key of KEYS) {
    const scored = entries
      .filter((entry) => entry.assessment.suitable)
      .map((entry) => ({
        id: entry.site.id,
        name: entry.site.name,
        hours: tileHours(entry.assessment)[key],
      }));
    if (scored.length < 2) {
      winners.set(key, new Set());
      continue;
    }
    const top = Math.max(...scored.map((item) => item.hours));
    const tied = scored
      .filter((item) => Math.abs(item.hours - top) < 1e-9)
      .sort((a, b) => a.name.localeCompare(b.name));
    winners.set(
      key,
      tied.length === scored.length ? new Set() : new Set(tied.slice(0, 1).map((i) => i.id)),
    );
  }
  return winners;
}
