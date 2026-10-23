import { describe, expect, it } from 'vitest';
import { filterValuesByYear, rowYear } from './sheet-rows';

const HEADERS = ['Submission Timestamp', 'Official Name', 'Awards ID'];

describe('rowYear', () => {
  it('reads the Awards ID, then the timestamp', () => {
    expect(rowYear(HEADERS, ['2025-12-31T23:00', 'A', 'AW-2026-001'])).toBe('2026');
    expect(rowYear(HEADERS, ['2026-10-14T10:00', 'B', ''])).toBe('2026');
    expect(rowYear(HEADERS, ['', 'C', 'AW-2026-TMP1760000000'])).toBe('2026');
    expect(rowYear(HEADERS, ['', 'D'])).toBe('');
  });
});

describe('filterValuesByYear', () => {
  const values = [
    HEADERS,
    ['', 'A', 'AW-2026-001'],
    ['', 'B', 'AW-2027-001'],
  ];

  it('keeps the header and the year\'s rows', () => {
    expect(filterValuesByYear(values, '2027')).toEqual([HEADERS, ['', 'B', 'AW-2027-001']]);
  });

  it('returns everything without a year', () => {
    expect(filterValuesByYear(values, null)).toBe(values);
  });
});
