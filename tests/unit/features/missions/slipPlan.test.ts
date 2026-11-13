import { describe, expect, it } from 'vitest';
import {
  DEMO_MISSIONS,
  DEFAULT_DEMO_MISSION,
  type DemoMission,
} from '../../../../src/data/demoData';
import {
  addMonthsUtc,
  appearsIn,
  findMissionByName,
  numbersInText,
  planSlip,
} from '../../../../src/features/missions/slipPlan';
import type { SlipReading } from '../../../../src/services/slipReading';
import { DAY_MS, formatClock } from '../../../../src/utils/time';

/** The time bar's time in these tests: 15 Nov 2026, 02:00 UTC. */
const TIME = Date.UTC(2026, 10, 15, 2, 0);

function reading(overrides: Partial<SlipReading> = {}): SlipReading {
  return {
    missionName: null,
    shift: null,
    date: null,
    powerDays: null,
    minSunDeg: null,
    minEarthDeg: null,
    relay: null,
    question: null,
    unclear: [],
    ...overrides,
  };
}

function plan(
  text: string,
  overrides: Partial<SlipReading>,
  options: { time?: number; selected?: DemoMission; missions?: readonly DemoMission[] } = {},
) {
  return planSlip(reading(overrides), {
    text,
    missions: options.missions ?? DEMO_MISSIONS,
    selected: options.selected ?? DEFAULT_DEMO_MISSION,
    time: options.time ?? TIME,
  });
}

function need(result: ReturnType<typeof plan>, field: string) {
  const line = result.needs.find((entry) => entry.field === field);
  if (!line) throw new Error(`no line for ${field}`);
  return line;
}

describe('numbersInText', () => {
  it('reads digits, decimals and English number words up to twenty', () => {
    expect(numbersInText('slipped 3 weeks, needs 4.5 days')).toEqual([3, 4.5]);
    expect(numbersInText('Three weeks, twenty days, Twelve degrees')).toEqual([3, 20, 12]);
    expect(numbersInText('on 2027-03-12')).toEqual([2027, 3, 12]);
  });

  it('counts "a"/"an" as 1 only before a unit', () => {
    expect(numbersInText('slipped a week')).toContain(1);
    expect(numbersInText('a month later')).toContain(1);
    expect(numbersInText('we have a relay and an issue')).not.toContain(1);
  });

  it('reads no other numbers (English only)', () => {
    expect(numbersInText('next month, a couple of weeks')).toEqual([]);
  });
});

describe('appearsIn and findMissionByName', () => {
  it('matches word for word, ignoring case and spacing', () => {
    expect(appearsIn('mission  b', 'Mission B slipped')).toBe(true);
    expect(appearsIn('Mission C', 'Mission B slipped')).toBe(false);
    expect(appearsIn('', 'anything')).toBe(false);
  });

  it('finds a mission by name, with or without "Demo"', () => {
    expect(findMissionByName(DEMO_MISSIONS, 'mission b')?.id).toBe('demo-mission-b');
    expect(findMissionByName(DEMO_MISSIONS, 'Demo Mission C')?.id).toBe('demo-mission-c');
    expect(findMissionByName(DEMO_MISSIONS, 'B')).toBeUndefined();
    expect(findMissionByName(DEMO_MISSIONS, 'IM-3')).toBeUndefined();
  });
});

describe('addMonthsUtc', () => {
  it('keeps the day, or moves it to the last day of a shorter month', () => {
    expect(addMonthsUtc(Date.UTC(2027, 0, 31, 6), 1)).toBe(Date.UTC(2027, 1, 28, 6));
    expect(addMonthsUtc(Date.UTC(2028, 0, 31), 1)).toBe(Date.UTC(2028, 1, 29));
    expect(addMonthsUtc(Date.UTC(2026, 10, 15, 2), 2)).toBe(Date.UTC(2027, 0, 15, 2));
    expect(addMonthsUtc(Date.UTC(2027, 2, 31), -1)).toBe(Date.UTC(2027, 1, 28));
    expect(addMonthsUtc(Date.UTC(2026, 10, 15), 12)).toBe(Date.UTC(2027, 10, 15));
  });
});

describe('planSlip: the date', () => {
  it('counts a shift from the time bar, in UTC, and says how', () => {
    const result = plan('Launch slipped 3 weeks', { shift: { shift: 3, unit: 'weeks' } });
    expect(result.time?.to).toBe(TIME + 21 * DAY_MS);
    expect(result.time?.how).toBe(`3 weeks later than ${formatClock(TIME)}`);
    expect(result.mission).toEqual({ kind: 'selected', mission: DEFAULT_DEMO_MISSION });
    expect(result.changed).toBe(false);
    expect(result.canApply).toBe(true);
  });

  it('reads written numbers and earlier shifts', () => {
    expect(plan('slipped three days', { shift: { shift: 3, unit: 'days' } }).time?.to).toBe(
      TIME + 3 * DAY_MS,
    );
    expect(plan('a week later', { shift: { shift: 1, unit: 'weeks' } }).time?.to).toBe(
      TIME + 7 * DAY_MS,
    );
    const earlier = plan('moved 2 weeks earlier', { shift: { shift: -2, unit: 'weeks' } });
    expect(earlier.time?.to).toBe(TIME - 14 * DAY_MS);
    expect(earlier.time?.how).toBe(`2 weeks earlier than ${formatClock(TIME)}`);
  });

  it('shifts by calendar months and years', () => {
    expect(plan('slipped 2 months', { shift: { shift: 2, unit: 'months' } }).time?.to).toBe(
      Date.UTC(2027, 0, 15, 2),
    );
    expect(plan('one year later', { shift: { shift: 1, unit: 'years' } }).time?.to).toBe(
      Date.UTC(2027, 10, 15, 2),
    );
  });

  it('refuses part months, and dates outside 1990–2100', () => {
    const part = plan('slipped 1.5 months', { shift: { shift: 1.5, unit: 'months' } });
    expect(part.time).toBeNull();
    expect(part.errors[0]).toMatch(/can't be put on a calendar/);
    expect(part.canApply).toBe(false);
    const far = plan('slipped 200 years', { shift: { shift: 200, unit: 'years' } });
    expect(far.errors).toEqual([
      'That date is outside what the app covers, 1 Jan 1990 to 31 Dec 2100.',
    ]);
  });

  it('puts an exact day at 00:00 UTC, and a month alone on the 15th', () => {
    const day = plan('slipped to 12 March 2027', {
      date: { day: 12, month: 'March', year: 2027 },
    });
    expect(day.time?.to).toBe(Date.UTC(2027, 2, 12));
    expect(day.time?.how).toBe('12 March 2027, from the start of the day');
    const month = plan('now in March 2027', { date: { day: null, month: 'March', year: 2027 } });
    expect(month.time?.to).toBe(Date.UTC(2027, 2, 15));
    expect(month.time?.how).toBe('mid-March 2027, so the whole month is in view');
  });

  it('takes the next such month when no year is written', () => {
    const march = plan('moved to March', { date: { day: null, month: 'March', year: null } });
    expect(march.time?.to).toBe(Date.UTC(2027, 2, 15));
    expect(march.time?.how).toMatch(/no year in your text, so the next March was used/);
    // The time bar's own month stays this year; an earlier day in it is next year.
    expect(
      plan('in November', { date: { day: null, month: 'November', year: null } }).time?.to,
    ).toBe(Date.UTC(2026, 10, 15));
    expect(plan('on 3 Nov', { date: { day: 3, month: 'November', year: null } }).time?.to).toBe(
      Date.UTC(2027, 10, 3),
    );
  });

  it('reports impossible dates instead of moving them', () => {
    const result = plan('on 31 February 2027', {
      date: { day: 31, month: 'February', year: 2027 },
    });
    expect(result.time).toBeNull();
    expect(result.errors).toEqual(['There is no 31 February 2027.']);
    expect(result.canApply).toBe(false);
  });

  it('refuses a shift and a date together', () => {
    const result = plan('slipped 3 weeks to 12 March 2027', {
      shift: { shift: 3, unit: 'weeks' },
      date: { day: 12, month: 'March', year: 2027 },
    });
    expect(result.time).toBeNull();
    expect(result.errors[0]).toMatch(/both a shift and a date/);
  });
});

describe('planSlip: numbers must be in the text', () => {
  it('drops a shift whose amount or unit is not in the text', () => {
    const amount = plan('the launch slipped', { shift: { shift: 3, unit: 'weeks' } });
    expect(amount.time).toBeNull();
    expect(amount.dropped).toEqual(["The shift's amount isn't in your text, so it was not used."]);
    const nextMonth = plan('slipped to next month', { shift: { shift: 1, unit: 'months' } });
    expect(nextMonth.time).toBeNull();
    const unit = plan('slipped 3 weeks', { shift: { shift: 3, unit: 'days' } });
    expect(unit.time).toBeNull();
    expect(unit.dropped[0]).toMatch(/unit \(days\) isn't in your text/);
  });

  it('drops a need whose number is not in the text, without showing it', () => {
    const result = plan('we need more power now', { powerDays: 7 });
    expect(result.dropped).toEqual([
      "Days of power needed: the number isn't in your text, so it was not used.",
    ]);
    expect(result.dropped.join(' ')).not.toContain('7');
    expect(need(result, 'daysNeeded')).toMatchObject({ after: '3 days', mentioned: false });
    expect(result.changed).toBe(false);
    expect(result.canApply).toBe(false);
  });

  it('drops a date part that is not in the text', () => {
    const month = plan('slipped to the 12th', { date: { day: 12, month: 'March', year: 2027 } });
    expect(month.time).toBeNull();
    expect(month.dropped[0]).toMatch(/month isn't in your text/);
    const day = plan('slipped to March 2027', { date: { day: 12, month: 'March', year: 2027 } });
    expect(day.time?.to).toBe(Date.UTC(2027, 2, 15));
    const year = plan('slipped to 12 March', { date: { day: 12, month: 'March', year: 2030 } });
    expect(year.time?.to).toBe(Date.UTC(2027, 2, 12));
    expect(year.dropped[0]).toMatch(/year isn't in your text/);
  });

  it('reads a relay only when the text says "relay"', () => {
    expect(plan('it now has a relay', { relay: true }).needs.at(-1)).toMatchObject({
      after: 'Yes',
      changed: true,
    });
    const invented = plan('IM-3 slipped', { relay: true });
    expect(invented.dropped).toContain(
      "Relay: your text doesn't mention a relay, so it was not used.",
    );
  });
});

describe('planSlip: the needs', () => {
  it('changes a need on top of the selected mission, before → after', () => {
    const result = plan('we now need 6 days of power', { powerDays: 6 });
    expect(need(result, 'daysNeeded')).toMatchObject({
      before: '3 days',
      after: '6 days',
      mentioned: true,
      changed: true,
    });
    expect(result.draft).toEqual({
      name: 'Demo Mission A',
      values: { minSunElevationDeg: '5', minEarthElevationDeg: '5', daysNeeded: '6' },
      hasRelay: false,
    });
    expect(result.changed).toBe(true);
    expect(result.canApply).toBe(true);
  });

  it('shows an out-of-range value with its error and never changes it', () => {
    const result = plan('the Sun must be 25 degrees up', { minSunDeg: 25 });
    expect(result.errors).toEqual([
      'Lowest Sun height for power 25°: Outside the DEMO range, 0 to 20°.',
    ]);
    expect(result.draft.values.minSunElevationDeg).toBe('25');
    expect(result.canApply).toBe(false);
    expect(plan('needs 0 days of power', { powerDays: 0 }).errors[0]).toMatch(/above 0 days/);
  });

  it('has nothing to apply when the values are the same as now', () => {
    const result = plan('needs 3 days of power', { powerDays: 3 });
    expect(need(result, 'daysNeeded')).toMatchObject({ mentioned: true, changed: false });
    expect(result.errors).toEqual([]);
    expect(result.canApply).toBe(false);
  });
});

describe('planSlip: the mission', () => {
  it('matches a typed mission against the list', () => {
    const result = plan('Mission B slipped 2 weeks', {
      missionName: 'Mission B',
      shift: { shift: 2, unit: 'weeks' },
    });
    expect(result.mission).toMatchObject({ kind: 'known', mission: { id: 'demo-mission-b' } });
    expect(need(result, 'hasRelay')).toMatchObject({ before: 'Yes', after: 'Yes' });
    // Switching to a mission is something to apply on its own.
    expect(plan('use demo mission c', { missionName: 'demo mission c' }).canApply).toBe(true);
  });

  it('drops a mission name that is not in the text', () => {
    const result = plan('slipped 2 weeks', {
      missionName: 'IM-3',
      shift: { shift: 2, unit: 'weeks' },
    });
    expect(result.mission.kind).toBe('selected');
    expect(result.dropped).toEqual(["A mission name that isn't in your text was not used."]);
  });

  it('keeps an unknown mission to its name and the numbers in the text, every other field empty', () => {
    const result = plan('IM-3 slipped 2 weeks and needs 4 days of power', {
      missionName: 'IM-3',
      shift: { shift: 2, unit: 'weeks' },
      powerDays: 4,
      minSunDeg: 7,
    });
    expect(result.mission).toEqual({ kind: 'unknown', name: 'IM-3' });
    expect(result.draft).toEqual({
      name: 'IM-3',
      values: { minSunElevationDeg: '', minEarthElevationDeg: '', daysNeeded: '4' },
      hasRelay: false,
    });
    expect(need(result, 'minEarthElevationDeg')).toMatchObject({
      before: null,
      after: 'Not given',
    });
    expect(result.dropped[0]).toMatch(/Lowest Sun height for power: the number isn't in your text/);
    expect(result.time?.to).toBe(TIME + 14 * DAY_MS);
    expect(result.canApply).toBe(false);
  });

  it('says when an unknown name is too long for the form', () => {
    const name = 'The Very Long Lunar Lander Mission Name';
    expect(plan(`${name} slipped`, { missionName: name }).errors).toEqual([
      'The mission name is too long: 30 characters at most.',
    ]);
  });
});

describe('planSlip: unclear and empty', () => {
  it('shows only word-for-word quotes from the text', () => {
    const result = plan('slipped 3 weeks, thermal margins are tight', {
      shift: { shift: 3, unit: 'weeks' },
      unclear: ['thermal margins are tight', 'it probably needs 9 days'],
    });
    expect(result.unclear).toEqual(['thermal margins are tight']);
    expect(result.unclearHidden).toBe(1);
  });

  it('notices when nothing was read', () => {
    const result = plan('hello there', {});
    expect(result.empty).toBe(true);
    expect(result.canApply).toBe(false);
  });
});
