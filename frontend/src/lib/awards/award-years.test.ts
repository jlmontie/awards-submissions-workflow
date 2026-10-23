import { describe, expect, it } from 'vitest';
import {
  AwardYear,
  calendarYear,
  endOfDay,
  isValidDate,
  otherOpenYear,
  parseAwardYears,
  startOfDay,
  submissionWindow,
  UPLOAD_GRACE_MS,
} from './award-years';

function year(overrides: Partial<AwardYear>): AwardYear {
  return {
    year: '2026',
    status: 'open',
    opens: '',
    closes: '',
    closedAt: '',
    updatedAt: '',
    updatedBy: '',
    ...overrides,
  };
}

const at = (iso: string) => Date.parse(iso);

describe('parseAwardYears', () => {
  it('reads rows after the header, tolerating hand edits', () => {
    expect(
      parseAwardYears([
        ['Year', 'Status', 'Opens', 'Closes'],
        [' 2026 ', 'OPEN', '2026-09-01', '2026-11-15'],
        ['2027', 'something else'],
        ['not a year', 'open'],
        [],
      ])
    ).toEqual([
      year({ year: '2026', status: 'open', opens: '2026-09-01', closes: '2026-11-15' }),
      year({ year: '2027', status: 'draft' }),
    ]);
  });
});

describe('isValidDate', () => {
  it('accepts real calendar dates only', () => {
    expect(isValidDate('2026-02-28')).toBe(true);
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('11/15/2026')).toBe(false);
  });
});

describe('day boundaries in Mountain time', () => {
  it('uses MDT (UTC-6) in summer and MST (UTC-7) in winter', () => {
    expect(new Date(startOfDay('2026-07-01')).toISOString()).toBe('2026-07-01T06:00:00.000Z');
    expect(new Date(startOfDay('2026-12-01')).toISOString()).toBe('2026-12-01T07:00:00.000Z');
  });

  it('ends a day at the next midnight across a DST change', () => {
    // DST ends 2026-11-01: that day is 25 hours long.
    expect(new Date(endOfDay('2026-10-31')).toISOString()).toBe('2026-11-01T06:00:00.000Z');
    expect(new Date(endOfDay('2026-11-01')).toISOString()).toBe('2026-11-02T07:00:00.000Z');
    // DST starts 2026-03-08: that day is 23 hours long.
    expect(new Date(endOfDay('2026-03-08')).toISOString()).toBe('2026-03-09T06:00:00.000Z');
  });
});

describe('calendarYear', () => {
  it('is the year in Utah, not in UTC', () => {
    // 11:30pm on New Year's Eve in Utah is already January 1 in UTC.
    expect(calendarYear(at('2027-01-01T06:30:00Z'))).toBe('2026');
    expect(calendarYear(at('2027-01-01T07:30:00Z'))).toBe('2027');
  });
});

describe('submissionWindow', () => {
  const deadline = '2026-11-15';
  const closesAt = endOfDay(deadline); // 2026-11-16T07:00Z

  it('takes entries for the open year', () => {
    expect(submissionWindow([year({ closes: deadline })], closesAt - 1)).toEqual({
      accepting: true,
      year: '2026',
    });
  });

  it('closes at the end of the closing day', () => {
    expect(submissionWindow([year({ closes: deadline })], closesAt)).toEqual({
      accepting: false,
      year: '2026',
      reason: 'closed',
    });
  });

  it('lets uploads finish for a grace period after the deadline', () => {
    const years = [year({ closes: deadline })];
    expect(submissionWindow(years, closesAt + 1000, { forUploads: true })).toEqual({
      accepting: true,
      year: '2026',
      graceUntil: closesAt + UPLOAD_GRACE_MS,
    });
    expect(submissionWindow(years, closesAt + UPLOAD_GRACE_MS, { forUploads: true })).toMatchObject({
      accepting: false,
    });
  });

  it('gives a manual close the same grace period', () => {
    const closedAt = '2026-11-01T18:00:00.000Z';
    const years = [year({ status: 'closed', closedAt })];
    expect(submissionWindow(years, at(closedAt) + 60_000)).toMatchObject({ accepting: false });
    expect(submissionWindow(years, at(closedAt) + 60_000, { forUploads: true })).toMatchObject({
      accepting: true,
      year: '2026',
    });
  });

  it('is not open before the opening date', () => {
    const years = [year({ opens: '2026-09-01' })];
    expect(submissionWindow(years, startOfDay('2026-09-01') - 1)).toEqual({
      accepting: false,
      year: '2026',
      reason: 'not_yet_open',
    });
    expect(submissionWindow(years, startOfDay('2026-09-01'))).toMatchObject({ accepting: true });
  });

  it('never takes entries for a draft', () => {
    expect(submissionWindow([year({ status: 'draft' })], Date.now(), { forUploads: true })).toMatchObject({
      accepting: false,
    });
  });

  it('files under the open year even when a later year exists as a draft', () => {
    const years = [year({ year: '2027', status: 'draft' }), year({ year: '2026' })];
    expect(submissionWindow(years, Date.now())).toEqual({ accepting: true, year: '2026' });
  });
});

describe('otherOpenYear', () => {
  it('finds a different open year', () => {
    const years = [year({ year: '2026' }), year({ year: '2027', status: 'draft' })];
    expect(otherOpenYear(years, '2027')).toBe('2026');
    expect(otherOpenYear(years, '2026')).toBeNull();
  });
});
