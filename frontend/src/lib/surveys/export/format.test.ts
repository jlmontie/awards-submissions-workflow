import { describe, it, expect } from 'vitest';
import { normalizers } from '../normalizers';
import {
  formatCount,
  formatRevenue,
  formatWebsite,
  joinProjectAndLocation,
} from './shared';
import { generateContractorExport } from './contractors';

/**
 * Print-formatting rules editorial used to apply by hand while scrubbing the
 * lists before they went to design. Each one is cheap to regress silently —
 * the export still builds either way — so they are pinned here.
 */

describe('formatRevenue', () => {
  it('groups thousands', () => {
    expect(formatRevenue('1000.00', false)).toBe('$1,000.0');
    expect(formatRevenue('12345.67', false)).toBe('$12,345.7');
    expect(formatRevenue('1234567.8', false)).toBe('$1,234,567.8');
  });

  it('leaves sub-thousand figures alone', () => {
    expect(formatRevenue('47.50', false)).toBe('$47.5');
    expect(formatRevenue('999.99', false)).toBe('$1,000.0');
    expect(formatRevenue('853.20', false)).toBe('$853.2');
  });

  it('still handles DND and empty entries', () => {
    expect(formatRevenue('1000.00', true)).toBe('DND');
    expect(formatRevenue('DND', false)).toBe('');
    expect(formatRevenue('', false)).toBe('');
    expect(formatRevenue('0.00', false)).toBe('');
  });
});

describe('formatCount', () => {
  it('groups thousands in headcounts', () => {
    expect(formatCount('1500')).toBe('1,500');
    expect(formatCount('12000')).toBe('12,000');
  });

  it('leaves small counts and already-grouped input alone', () => {
    expect(formatCount('250')).toBe('250');
    expect(formatCount('1,500')).toBe('1,500');
  });

  it('passes through blank and non-numeric entries', () => {
    expect(formatCount('')).toBe('');
    expect(formatCount(undefined)).toBe('');
    expect(formatCount('n/a')).toBe('n/a');
  });
});

describe('website normalizer', () => {
  it('reduces a URL to its bare domain', () => {
    expect(normalizers.website('www.Okland.com')).toBe('okland.com');
    expect(normalizers.website('http://www.okland.com/')).toBe('okland.com');
    expect(normalizers.website('https://Okland.com')).toBe('okland.com');
    expect(normalizers.website('okland.com')).toBe('okland.com');
  });

  it('keeps a path but drops the trailing slash', () => {
    expect(normalizers.website('https://www.okland.com/about/Team/')).toBe('okland.com/about/Team');
  });

  it('passes blanks through', () => {
    expect(normalizers.website('')).toBe('');
    expect(normalizers.website(undefined)).toBe('');
  });

  it('is what the export applies', () => {
    expect(formatWebsite('HTTPS://WWW.Okland.com/')).toBe('okland.com');
  });
});

describe('joinProjectAndLocation', () => {
  it('drops a redundant Utah state token', () => {
    expect(joinProjectAndLocation('Point of the Mountain', 'Lehi, UT')).toBe('Point of the Mountain — Lehi');
    expect(joinProjectAndLocation('Point of the Mountain', 'Lehi UT')).toBe('Point of the Mountain — Lehi');
    expect(joinProjectAndLocation('Point of the Mountain', 'Lehi, Utah')).toBe('Point of the Mountain — Lehi');
    expect(joinProjectAndLocation('Point of the Mountain', 'UT')).toBe('Point of the Mountain');
  });

  it('keeps an out-of-state location, which is real information', () => {
    expect(joinProjectAndLocation('Data Hall 4', 'Boise, ID')).toBe('Data Hall 4 — Boise, ID');
  });

  it('is unchanged for a plain city', () => {
    expect(joinProjectAndLocation('Tower', 'Salt Lake City')).toBe('Tower — Salt Lake City');
  });
});

describe('contractor revenue block', () => {
  const base = {
    firm_name: 'Test GC', state: 'UT', city: 'Provo', zip: '84601',
    discipline_general_building: 'TRUE',
  };

  function gcOverallText(firm: Record<string, string>): string {
    const result = generateContractorExport([{ ...base, ...firm }], 2026);
    const section = result.sections.find((s) => s.key === 'gcOverall');
    if (!section) throw new Error('no gcOverall section');
    return section.text;
  }

  it('collapses an All U.S. line that duplicates the Utah line', () => {
    const text = gcOverallText({
      revenue_ut_current: '250.00', revenue_ut_prior_1: '200.00', revenue_ut_prior_2: '150.00',
      revenue_all_current: '250.00', revenue_all_prior_1: '200.00', revenue_all_prior_2: '150.00',
    });
    expect(text).toContain('$250.0');
    // One occurrence only — the duplicated second line is dropped.
    expect(text.match(/\$250\.0/g)).toHaveLength(1);
  });

  it('keeps both lines when the firm really has out-of-state revenue', () => {
    const text = gcOverallText({
      revenue_ut_current: '250.00', revenue_ut_prior_1: '200.00', revenue_ut_prior_2: '150.00',
      revenue_all_current: '900.00', revenue_all_prior_1: '800.00', revenue_all_prior_2: '700.00',
    });
    expect(text).toContain('$250.0');
    expect(text).toContain('$900.0');
  });

  it('keeps both DND lines', () => {
    const text = gcOverallText({ revenue_dnd: 'TRUE', num_employees_ut: '400' });
    expect(text.match(/DND/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it('heads the revenue columns with years and stacks the office scopes', () => {
    const text = gcOverallText({ revenue_ut_current: '250.00' });
    const lines = text.split('\n');
    const yearRow = lines.find((l) => l.startsWith('Firm Name'));
    expect(yearRow?.split('\t')).toEqual([
      'Firm Name', 'Year Est.', 'Top Executive',
      'Largest Utah Project Completed in 2025',
      '2025', '2024', '2023', 'Top Markets', '%',
    ]);
    expect(lines.some((l) => l.split('\t')[4] === '(Utah offices)')).toBe(true);
    expect(lines.some((l) => l.split('\t')[4] === '(All U.S. offices)')).toBe(true);
    expect(text).not.toContain('2025 (Utah offices)');
  });
});
