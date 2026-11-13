import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_DEMO_MISSION } from '../../../../src/data/demoData';
import {
  CUSTOM_MISSIONS_KEY,
  draftFrom,
  loadCustomMissions,
  missionFromDraft,
  newCustomId,
  saveCustomMissions,
  uniqueName,
  validateDraft,
} from '../../../../src/features/missions/customMissions';

afterEach(() => {
  window.localStorage.clear();
});

describe('validateDraft', () => {
  it('accepts a preset with a name', () => {
    expect(validateDraft(draftFrom(DEFAULT_DEMO_MISSION, 'Mine'))).toEqual({});
  });

  it('needs a name, numbers, some days of power, and values inside the DEMO ranges', () => {
    const draft = draftFrom(DEFAULT_DEMO_MISSION, '');
    draft.values.daysNeeded = '0';
    draft.values.minSunElevationDeg = '25';
    draft.values.minEarthElevationDeg = 'x';
    expect(validateDraft(draft)).toEqual({
      name: 'Give it a name.',
      daysNeeded: 'It needs some power: above 0 days.',
      minSunElevationDeg: 'Outside the DEMO range, 0 to 20°.',
      minEarthElevationDeg: 'Enter a number.',
    });
  });
});

describe('missionFromDraft and uniqueName', () => {
  it('makes a custom mission from the draft', () => {
    const draft = draftFrom(DEFAULT_DEMO_MISSION, 'Polar hopper');
    draft.values.daysNeeded = '7.5';
    draft.hasRelay = true;
    expect(missionFromDraft(draft, 'custom-1', 'Polar hopper')).toEqual({
      id: 'custom-1',
      name: 'Polar hopper',
      custom: true,
      minSunElevationDeg: 5,
      minEarthElevationDeg: 5,
      daysNeeded: 7.5,
      hasRelay: true,
    });
  });

  it('numbers a taken name', () => {
    expect(uniqueName('Mine', ['mine'])).toBe('Mine (2)');
    expect(uniqueName('Mine', ['Mine', 'Mine (2)'])).toBe('Mine (3)');
    expect(newCustomId()).toMatch(/^custom-/);
  });
});

describe('stored presets', () => {
  it('round-trips, and drops anything malformed or impossible', () => {
    const good = missionFromDraft(draftFrom(DEFAULT_DEMO_MISSION, 'Mine'), 'custom-a', 'Mine');
    expect(saveCustomMissions([good])).toBe(true);
    expect(loadCustomMissions()).toEqual([good]);
    window.localStorage.setItem(
      CUSTOM_MISSIONS_KEY,
      JSON.stringify([good, { ...good, id: 'demo-mission-a' }, { ...good, daysNeeded: 0 }, 'junk']),
    );
    expect(loadCustomMissions()).toEqual([good]);
    window.localStorage.setItem(CUSTOM_MISSIONS_KEY, '{not json');
    expect(loadCustomMissions()).toEqual([]);
  });
});
