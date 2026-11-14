import { describe, expect, it } from 'vitest';
import {
  batteryNeededHere,
  findLander,
  LANDER_FIELD_LABEL,
  LanderDataError,
  landerValueStatus,
  LANDERS,
  LANDERS_LOADED,
  mentionsConflict,
  nightSurvival,
  NOT_PUBLISHED,
  parseLanders,
  type Lander,
} from '../../../src/services/landers';
import { SITES } from '../../../src/services/sites';

const notPublished = { value: null, tag: 'not published', source: null };

// A made-up lander for the format tests only (no real values).
const TEST_LANDER = {
  id: 'test-lander',
  name: 'Test Lander',
  solarPowerW: notPublished,
  batteryWh: { value: 1000, tag: 'S', source: 'https://example.org/test', note: 'made up' },
  heaterW: { value: 50, tag: 'A', source: null },
  panelAreaM2: notPublished,
  touchdownSlopeDeg: notPublished,
};

const problemsOf = (raw: unknown): readonly string[] => {
  try {
    parseLanders(raw);
  } catch (error) {
    if (error instanceof LanderDataError) return error.problems;
    throw error;
  }
  return [];
};

const lander = (id: string): Lander => {
  const found = findLander(id);
  if (!found) throw new Error(`no lander ${id}`);
  return found;
};

describe("data/landers.json (Miral's)", () => {
  it('loads the four landers', () => {
    expect(LANDERS_LOADED).toBe(true);
    expect(LANDERS.map((entry) => entry.id)).toEqual([
      'nova-c',
      'blue-ghost-1',
      'griffin-1',
      'chandrayaan-3',
    ]);
  });

  it('has a lander for every site', () => {
    for (const site of SITES) expect(findLander(site.landerId)?.id).toBe(site.landerId);
  });

  it("keeps Nova-C's values with their tags and sources", () => {
    const { fields } = lander('nova-c');
    expect(fields.batteryWh).toMatchObject({ value: 1554, tag: 'S' });
    expect(fields.batteryWh.source).toBe('https://apps.fcc.gov/els/GetAtt.html?id=265886');
    expect(fields.heaterW).toMatchObject({ value: 100, tag: 'A', source: null });
    expect(fields.solarPowerW).toMatchObject({ value: 788, tag: 'S' });
    expect(fields.solarPowerW.source).toBe('https://apps.fcc.gov/els/GetAtt.html?id=265886');
    expect(fields.panelAreaM2).toMatchObject({ value: null, tag: 'not published' });
  });

  it("shows Nova-C's conflicts: 788 W against 200 W, and 1554 Wh against 700 Wh", () => {
    const { fields } = lander('nova-c');
    expect(mentionsConflict(fields.solarPowerW)).toBe(true);
    expect(fields.solarPowerW.note).toContain('200 W');
    expect(mentionsConflict(fields.batteryWh)).toBe(true);
    expect(fields.batteryWh.note).toContain('700 Wh');
    expect(mentionsConflict(fields.heaterW)).toBe(false);
  });

  it('also shows notes where other pages or secondary pages disagree', () => {
    expect(mentionsConflict(lander('blue-ghost-1').fields.solarPowerW)).toBe(true);
    expect(mentionsConflict(lander('nova-c').fields.touchdownSlopeDeg)).toBe(true);
    expect(mentionsConflict(lander('chandrayaan-3').fields.solarPowerW)).toBe(false);
  });

  it('calls heaterW the night load, never the heater', () => {
    expect(LANDER_FIELD_LABEL.heaterW).toBe('Night load (heater + electronics)');
    expect(Object.values(LANDER_FIELD_LABEL).some((label) => /^Heater/i.test(label))).toBe(false);
  });

  it('Nova-C (1554 Wh ÷ 100 W = 15.5 h) survives 10 h of darkness and fails 43 h', () => {
    const survives = nightSurvival(lander('nova-c'), { hours: 10, atLeast: false });
    expect(survives).toMatchObject({ kind: 'survives', darkHours: 10 });
    expect(survives.kind !== 'cant-judge' && survives.batteryHours).toBeCloseTo(15.54, 2);
    expect(nightSurvival(lander('nova-c'), { hours: 43, atLeast: false })).toMatchObject({
      kind: 'doesnt',
      darkHours: 43,
    });
  });

  it("Blue Ghost 1, Griffin-1 and Chandrayaan-3: can't judge, not published", () => {
    for (const id of ['blue-ghost-1', 'griffin-1', 'chandrayaan-3']) {
      expect(nightSurvival(lander(id), { hours: 10, atLeast: false })).toEqual({
        kind: 'cant-judge',
        cause: 'not-published',
        reason: "Can't judge: not published",
        missing: ['batteryWh', 'heaterW'],
      });
    }
  });

  it('Griffin-1 (upcoming) has every value not published', () => {
    const { fields } = lander('griffin-1');
    expect(Object.values(fields).every((field) => field.value === null)).toBe(true);
    expect(Object.values(fields).every((field) => landerValueStatus(field) === 'Unavailable')).toBe(
      true,
    );
  });

  it("keeps Chandrayaan-3's 12° touchdown slope as a sourced spec (information only)", () => {
    const slope = lander('chandrayaan-3').fields.touchdownSlopeDeg;
    expect(slope).toMatchObject({ value: 12, tag: 'S' });
    expect(landerValueStatus(slope)).toBe('Real data');
  });
});

describe('parseLanders', () => {
  it('reads a lander in the file format', () => {
    const [entry] = parseLanders([TEST_LANDER]);
    expect(entry?.fields.batteryWh).toEqual({
      value: 1000,
      tag: 'S',
      source: 'https://example.org/test',
      note: 'made up',
    });
    expect(entry?.fields.solarPowerW).toEqual(NOT_PUBLISHED);
  });

  it('lists every problem', () => {
    expect(problemsOf({ landers: [] })).toEqual(['expected a list of landers']);
    expect(
      problemsOf([
        {
          ...TEST_LANDER,
          id: '',
          heater: notPublished,
          batteryWh: { value: 'lots', tag: 'S', source: null },
          heaterW: { value: null, tag: 'A', source: null },
          panelAreaM2: { value: 2, tag: 'not published', source: null },
          touchdownSlopeDeg: { value: 3, tag: 'maybe', source: null },
        },
      ]),
    ).toEqual([
      '[0].id must be a non-empty string',
      '[0].heater is not a known field',
      '[0].batteryWh.value must be a number or null',
      '[0].heaterW has no value, so its tag must be "not published"',
      '[0].panelAreaM2 has a value, so its tag can\'t be "not published"',
      '[0].touchdownSlopeDeg.tag must be one of S, S*, D, A, "not published"',
    ]);
    const { solarPowerW: _dropped, ...missing } = TEST_LANDER;
    expect(_dropped).toBe(notPublished);
    expect(problemsOf([missing])).toEqual(['[0].solarPowerW must be { value, tag, source, note }']);
    expect(problemsOf([TEST_LANDER, TEST_LANDER])).toEqual(['[1].id "test-lander" is repeated']);
  });

  it('maps tags to the data-status words', () => {
    const value = (tag: 'S' | 'S*' | 'D' | 'A') => ({ value: 1, tag, source: null, note: null });
    expect(landerValueStatus(value('S'))).toBe('Real data');
    expect(landerValueStatus(value('S*'))).toBe('Real data');
    expect(landerValueStatus(value('D'))).toBe('Calculated');
    expect(landerValueStatus(value('A'))).toBe('Assumed');
    expect(landerValueStatus(NOT_PUBLISHED)).toBe('Unavailable');
  });
});

describe('nightSurvival', () => {
  const test = parseLanders([TEST_LANDER])[0] as Lander;

  it('compares battery Wh ÷ night load W with the darkness, keeping "at least"', () => {
    // 1000 Wh ÷ 50 W = 20 h.
    expect(nightSurvival(test, { hours: 20, atLeast: false })).toEqual({
      kind: 'survives',
      batteryHours: 20,
      darkHours: 20,
      darkAtLeast: false,
    });
    expect(nightSurvival(test, { hours: 21, atLeast: true })).toMatchObject({
      kind: 'doesnt',
      darkAtLeast: true,
    });
  });

  it("can't judge when the battery outlasts darkness cut by the range's edge (QA B1)", () => {
    // IM-1, 2 Dec 2026 alone: "at least 14 h" of darkness; the real night is far longer.
    expect(nightSurvival(lander('nova-c'), { hours: 14, atLeast: true })).toMatchObject({
      kind: 'cant-judge',
      cause: 'night-longer',
      reason: "Can't judge: the night runs past the dates checked",
      missing: [],
      darkHours: 14,
    });
    // A battery shorter than the darkness already seen fails for certain.
    expect(nightSurvival(lander('nova-c'), { hours: 43, atLeast: true })).toMatchObject({
      kind: 'doesnt',
      darkAtLeast: true,
    });
  });

  it("can't judge when only one value is missing (the null case)", () => {
    const noBattery: Lander = { ...test, fields: { ...test.fields, batteryWh: NOT_PUBLISHED } };
    expect(nightSurvival(noBattery, { hours: 5, atLeast: false })).toEqual({
      kind: 'cant-judge',
      cause: 'not-published',
      reason: "Can't judge: not published",
      missing: ['batteryWh'],
    });
  });

  it('says when no lander data is loaded', () => {
    expect(nightSurvival(undefined, { hours: 5, atLeast: false })).toEqual({
      kind: 'cant-judge',
      cause: 'no-lander',
      reason: "Can't judge: lander data not loaded",
      missing: [],
    });
  });
});

describe('batteryNeededHere', () => {
  it('is night load W × hours, and that ÷ 143 Wh/kg', () => {
    const needed = batteryNeededHere(20, 328);
    expect(needed.wh).toBe(6560);
    expect(needed.kg).toBeCloseTo(45.87, 2);
  });
});
