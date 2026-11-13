import { afterEach, describe, expect, it, vi } from 'vitest';
import { UI_PREFS_KEY, loadUiPrefs, saveUiPrefs, sectionOpen } from '../../../src/utils/uiPrefs';

describe('uiPrefs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.removeItem(UI_PREFS_KEY);
  });

  it('merges changes, keeping sections and sidebars already saved', () => {
    window.localStorage.removeItem(UI_PREFS_KEY);
    saveUiPrefs({ sections: { 'advise.lander': false }, sidebars: { advise: false } });
    saveUiPrefs({ sections: { 'advise.sites': true }, tourDone: true });
    const prefs = loadUiPrefs();
    expect(prefs.sections).toEqual({ 'advise.lander': false, 'advise.sites': true });
    expect(prefs.sidebars).toEqual({ advise: false });
    expect(prefs.tourDone).toBe(true);
    expect(sectionOpen(prefs, 'advise.lander', true)).toBe(false);
    expect(sectionOpen(prefs, 'missing', true)).toBe(true);
  });

  it('ignores corrupt data and storage that throws', () => {
    window.localStorage.setItem(UI_PREFS_KEY, '{not json');
    expect(loadUiPrefs()).toEqual({});
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadUiPrefs()).toEqual({});
    expect(() => saveUiPrefs({ tourDone: true })).not.toThrow();
  });
});
