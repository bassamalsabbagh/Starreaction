import { describe, expect, it } from 'vitest';
import { SLIP_FIELDS, readSlipReading } from '../../../src/services/slipReading';

const EMPTY = {
  missionName: null,
  shift: null,
  date: null,
  range: null,
  powerDays: null,
  minSunDeg: null,
  minEarthDeg: null,
  relay: null,
  question: null,
  unclear: [],
};

describe('readSlipReading', () => {
  it('accepts a reply with every field, null or set', () => {
    expect(readSlipReading(EMPTY)).toEqual(EMPTY);
    const full = {
      missionName: 'Mission B',
      shift: { shift: -2, unit: 'weeks' },
      date: null,
      range: null,
      powerDays: 4.5,
      minSunDeg: 5,
      minEarthDeg: 0,
      relay: true,
      question: {
        about: 'when',
        siteName: 'Site Alpha',
        from: { month: 'October', year: null },
        to: { month: 'November', year: 2027 },
      },
      unclear: ['the bit about heaters'],
    };
    expect(readSlipReading(full)).toEqual(full);
    expect(
      readSlipReading({ ...EMPTY, date: { day: null, month: 'March', year: null } }),
    ).toMatchObject({ date: { day: null, month: 'March', year: null } });
  });

  it('accepts the five kinds of question the app answers, and no other', () => {
    for (const about of ['when', 'where', 'sunlight', 'earth', 'passes']) {
      const value = { ...EMPTY, question: { about, siteName: null, from: null, to: null } };
      expect(readSlipReading(value)?.question?.about).toBe(about);
    }
    expect(
      readSlipReading({
        ...EMPTY,
        question: { about: 'power', siteName: null, from: null, to: null },
      }),
    ).toBeNull();
  });

  it('reads a span of dates, day and year only when typed', () => {
    const range = {
      from: { day: 12, month: 'December', year: null },
      to: { day: 25, month: 'December', year: 2026 },
    };
    expect(readSlipReading({ ...EMPTY, range })?.range).toEqual(range);
    expect(
      readSlipReading({
        ...EMPTY,
        range: { from: { day: null, month: 'March', year: null }, to: range.to },
      })?.range?.from,
    ).toEqual({ day: null, month: 'March', year: null });
  });

  it('refuses a malformed span', () => {
    const to = { day: 25, month: 'December', year: null };
    for (const range of [
      { from: null, to },
      { from: { day: 32, month: 'December', year: null }, to },
      { from: { day: 1, month: 'Dec', year: null }, to },
      { from: to, to, extra: 1 },
      'between 12 and 25',
    ]) {
      expect(readSlipReading({ ...EMPTY, range })).toBeNull();
    }
    const { range: _range, ...noRange } = EMPTY;
    expect(_range).toBeNull();
    expect(readSlipReading(noRange)).toBeNull();
  });

  it('lists the same fields as the reply type', () => {
    expect(Object.keys(EMPTY)).toEqual([...SLIP_FIELDS]);
  });

  it.each([
    ['not an object', 'hello'],
    ['an array', []],
    ['null', null],
    ['a missing field', { ...EMPTY, relay: undefined }],
    ['an extra field', { ...EMPTY, comment: 'I worked out the date for you' }],
    ['a number as text', { ...EMPTY, powerDays: '6' }],
    ['an infinite number', { ...EMPTY, powerDays: Number.POSITIVE_INFINITY }],
    ['an empty mission name', { ...EMPTY, missionName: '  ' }],
    ['an unknown unit', { ...EMPTY, shift: { shift: 3, unit: 'fortnights' } }],
    ['a shift with an extra field', { ...EMPTY, shift: { shift: 3, unit: 'days', to: 'x' } }],
    ['a month number', { ...EMPTY, date: { day: 1, month: 3, year: 2027 } }],
    ['day 0', { ...EMPTY, date: { day: 0, month: 'March', year: 2027 } }],
    ['day 32', { ...EMPTY, date: { day: 32, month: 'March', year: 2027 } }],
    ['a part day', { ...EMPTY, date: { day: 1.5, month: 'March', year: 2027 } }],
    ['relay as text', { ...EMPTY, relay: 'yes' }],
    ['too many unclear notes', { ...EMPTY, unclear: ['a', 'b', 'c', 'd', 'e', 'f'] }],
    ['an unclear note that is not text', { ...EMPTY, unclear: [3] }],
    ['an over-long unclear note', { ...EMPTY, unclear: ['x'.repeat(201)] }],
    [
      'a question about something else',
      { ...EMPTY, question: { about: 'why', siteName: null, from: null, to: null } },
    ],
    [
      'a question with an answer in it',
      {
        ...EMPTY,
        question: { about: 'when', siteName: null, from: null, to: null, answer: '3 March' },
      },
    ],
    [
      'a question month with a day',
      {
        ...EMPTY,
        question: {
          about: 'when',
          siteName: null,
          from: { day: 3, month: 'March', year: null },
          to: null,
        },
      },
    ],
    [
      'an empty site name',
      { ...EMPTY, question: { about: 'where', siteName: ' ', from: null, to: null } },
    ],
  ])('rejects %s', (_label, value) => {
    expect(readSlipReading(value)).toBeNull();
  });
});
