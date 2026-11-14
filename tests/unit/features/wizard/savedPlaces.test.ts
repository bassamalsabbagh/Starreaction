import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SAVED_PLACES_KEY,
  SAVED_PLACES_MAX,
  addSavedPlace,
  coordinateLabel,
  loadSavedPlaces,
  removeSavedPlace,
  storeSavedPlaces,
} from '../../../../src/features/wizard/savedPlaces';

const POINT = { lat: -84.79, lon: 29.2 };

describe('saved places', () => {
  beforeEach(() => window.localStorage.clear());

  it('names a place by its coordinates unless it is renamed', () => {
    expect(coordinateLabel(POINT)).toBe('-84.79, 29.20');
    expect(addSavedPlace([], '  ', POINT)[0]?.name).toBe('-84.79, 29.20');
    expect(addSavedPlace([], ' Rim camp ', POINT)[0]?.name).toBe('Rim camp');
  });

  it('keeps one place per spot (a second save renames it), newest first, capped', () => {
    const once = addSavedPlace([], 'A', POINT);
    const renamed = addSavedPlace(once, 'B', POINT);
    expect(renamed).toHaveLength(1);
    expect(renamed[0]?.name).toBe('B');
    let list = renamed;
    for (let i = 0; i < SAVED_PLACES_MAX + 3; i += 1) {
      list = addSavedPlace(list, `P${i}`, { lat: -80 - i * 0.1, lon: i });
    }
    expect(list).toHaveLength(SAVED_PLACES_MAX);
    expect(list[0]?.name).toBe(`P${SAVED_PLACES_MAX + 2}`);
  });

  it('removes a place by its id', () => {
    const list = addSavedPlace(addSavedPlace([], 'A', POINT), 'B', { lat: -85, lon: 10 });
    expect(removeSavedPlace(list, coordinateLabel(POINT)).map((item) => item.name)).toEqual(['B']);
  });

  it('stores and loads the list, and drops unreadable entries', () => {
    storeSavedPlaces(addSavedPlace([], 'Rim camp', POINT));
    expect(loadSavedPlaces()).toEqual([
      { id: '-84.79, 29.20', name: 'Rim camp', lat: -84.79, lon: 29.2 },
    ]);
    window.localStorage.setItem(
      SAVED_PLACES_KEY,
      JSON.stringify([
        { name: 5, lat: 1, lon: 2 },
        { name: 'ok', lat: 'x' },
        { name: 'bad', lat: 99, lon: 0 },
      ]),
    );
    expect(loadSavedPlaces()).toEqual([]);
    window.localStorage.setItem(SAVED_PLACES_KEY, '{not json');
    expect(loadSavedPlaces()).toEqual([]);
  });

  it('works when storage is blocked', () => {
    const blocked = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadSavedPlaces()).toEqual([]);
    expect(() => storeSavedPlaces(addSavedPlace([], 'A', POINT))).not.toThrow();
    blocked.mockRestore();
    set.mockRestore();
  });
});
