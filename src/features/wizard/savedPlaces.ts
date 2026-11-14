/**
 * Places the user saved from the Location step, kept in this browser only (localStorage, every
 * read and write in try/catch: it can be blocked or empty). A place is its name and its point;
 * the default name is the coordinates. Pure apart from `loadSavedPlaces` and `storeSavedPlaces`.
 */
import type { LatLon } from '../../utils/lunarSky';

export const SAVED_PLACES_KEY = 'starreaction.savedPlaces.v1';
export const SAVED_PLACES_MAX = 12;
export const SAVED_NAME_MAX = 30;

export interface SavedPlace {
  /** The coordinates as text: one saved place per spot. */
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
}

/** "-84.79, 29.20": a point as the coordinate box shows it. */
export function coordinateLabel(point: LatLon): string {
  return `${point.lat.toFixed(2)}, ${point.lon.toFixed(2)}`;
}

/** Saved places from storage; anything unreadable is dropped, and no storage gives none. */
export function loadSavedPlaces(): SavedPlace[] {
  try {
    const raw = window.localStorage.getItem(SAVED_PLACES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const places: SavedPlace[] = [];
    for (const item of parsed as unknown[]) {
      if (typeof item !== 'object' || item === null) continue;
      const { name, lat, lon } = item as Record<string, unknown>;
      if (typeof name !== 'string' || typeof lat !== 'number' || typeof lon !== 'number') continue;
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90) continue;
      places.push({
        id: coordinateLabel({ lat, lon }),
        name: name.slice(0, SAVED_NAME_MAX),
        lat,
        lon,
      });
    }
    return places.slice(0, SAVED_PLACES_MAX);
  } catch {
    return [];
  }
}

/** Keeps the list for the next visit; a blocked store just means it is not kept. */
export function storeSavedPlaces(places: readonly SavedPlace[]): void {
  try {
    window.localStorage.setItem(
      SAVED_PLACES_KEY,
      JSON.stringify(places.map(({ name, lat, lon }) => ({ name, lat, lon }))),
    );
  } catch {
    // Not kept: the places still show for this visit.
  }
}

/**
 * The list with this spot saved under `name` (blank: the coordinates). A spot saved before is
 * renamed in place; the newest comes first and the list is capped.
 */
export function addSavedPlace(
  places: readonly SavedPlace[],
  name: string,
  point: LatLon,
): SavedPlace[] {
  const id = coordinateLabel(point);
  const trimmed = name.trim().slice(0, SAVED_NAME_MAX);
  const place: SavedPlace = {
    id,
    name: trimmed === '' ? id : trimmed,
    lat: point.lat,
    lon: point.lon,
  };
  return [place, ...places.filter((item) => item.id !== id)].slice(0, SAVED_PLACES_MAX);
}

export function removeSavedPlace(places: readonly SavedPlace[], id: string): SavedPlace[] {
  return places.filter((item) => item.id !== id);
}
