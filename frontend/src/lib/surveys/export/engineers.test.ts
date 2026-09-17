import { describe, it, expect } from 'vitest';
import { generateEngineerExport } from './engineers';
import type { Firm } from './shared';

/**
 * The engineering page had been exporting in the architect's 3-line shape:
 * no discipline lists, no ranking numbers, phone and website in the second
 * column, and only three top markets. The printed page is the GC shape.
 * Each of those is pinned here, because the export builds either way.
 */

function firm(overrides: Partial<Firm> = {}): Firm {
  return {
    firm_name: 'Test Engineers',
    year_founded: '1968',
    top_executive: 'Bryan Foote',
    top_executive_title: 'President',
    years_at_firm: '35',
    address: '2162 W Grove Parkway STE 100',
    city: 'Pleasant Grove',
    state: 'UT',
    zip: '84062',
    phone: '8017635100',
    website: 'https://www.horrocks.com/',
    num_employees: '627',
    revenue_current: '256.00',
    revenue_prior_1: '206.00',
    revenue_prior_2: '192.00',
    largest_project_completed: 'I-15 5600 S PDB',
    largest_project_completed_location: 'Roy, UT',
    largest_project_upcoming: 'I-15 MP 6-8',
    largest_project_upcoming_location: 'St. George, UT',
    pct_highway: '67',
    pct_telecomm: '6',
    pct_water: '15',
    pct_industrial: '4',
    discipline_civil: 'TRUE',
    ...overrides,
  } as Firm;
}

function sectionText(firms: Firm[], key: string): string {
  const result = generateEngineerExport(firms, 2026);
  const section = result.sections.find((s) => s.key === key);
  if (!section) throw new Error(`no ${key} section`);
  return section.text;
}

/** The 5 tab-delimited lines of the first firm block after the header. */
function firstBlock(text: string): string[][] {
  const lines = text.split('\n');
  const headerAt = lines.findIndex((l) => l.split('\t')[1] === 'Phone / Website');
  const start = lines.findIndex((l, i) => i > headerAt && l.trim() !== '');
  return lines.slice(start, start + 5).map((l) => l.split('\t'));
}

describe('engineer export sections', () => {
  it('emits a list per discipline, not a Utah/out-of-state pair', () => {
    const result = generateEngineerExport(
      [
        firm({ firm_name: 'Civil Co', discipline_civil: 'TRUE' }),
        firm({ firm_name: 'MEP Co', discipline_civil: '', discipline_mep: 'TRUE' }),
        firm({ firm_name: 'Struct Co', discipline_civil: '', discipline_structural: 'TRUE' }),
      ],
      2026,
    );
    expect(result.sections.map((s) => s.key)).toEqual([
      'utah', 'civil', 'mep', 'structural',
    ]);
  });

  it('puts a firm in the overall list and in its own discipline list', () => {
    const firms = [
      firm({ firm_name: 'Civil Co', discipline_civil: 'TRUE' }),
      firm({ firm_name: 'MEP Co', discipline_civil: '', discipline_mep: 'TRUE' }),
    ];
    expect(sectionText(firms, 'utah')).toContain('Civil Co');
    expect(sectionText(firms, 'utah')).toContain('MEP Co');
    expect(sectionText(firms, 'civil')).toContain('Civil Co');
    expect(sectionText(firms, 'civil')).not.toContain('MEP Co');
  });

  it('skips a discipline nobody selected', () => {
    const result = generateEngineerExport([firm()], 2026);
    expect(result.sections.map((s) => s.key)).not.toContain('mep');
  });

  it('re-ranks within a discipline rather than carrying overall positions', () => {
    const firms = [
      firm({ firm_name: 'Big MEP', revenue_current: '500.00', discipline_civil: '', discipline_mep: 'TRUE' }),
      firm({ firm_name: 'Alpha Civil', revenue_current: '400.00', discipline_civil: 'TRUE' }),
      firm({ firm_name: 'Small Civil', revenue_current: '10.00', discipline_civil: 'TRUE' }),
    ];
    const civil = sectionText(firms, 'civil').split('\n');
    expect(civil.find((l) => l.includes('Alpha Civil'))?.split('\t')[0]).toBe('1.');
    expect(civil.find((l) => l.includes('Small Civil'))?.split('\t')[0]).toBe('2.');
  });
});

describe('engineer firm block', () => {
  it('is 5 lines with the left column stacking firm/address/city/phone/website', () => {
    const block = firstBlock(sectionText([firm()], 'utah'));
    expect(block.map((row) => row[1])).toEqual([
      'Test Engineers',
      '2162 W Grove Parkway #100',
      'Pleasant Grove, UT 84062',
      '801-763-5100',
      'horrocks.com',
    ]);
  });

  it('stacks year est. / employees / years at firm in the second column', () => {
    const block = firstBlock(sectionText([firm()], 'utah'));
    expect(block.map((row) => row[2])).toEqual(['1968', '627', '35', '', '']);
  });

  it('numbers the ranked firms', () => {
    const firms = [
      firm({ firm_name: 'First', revenue_current: '99.00' }),
      firm({ firm_name: 'Second', revenue_current: '50.00' }),
    ];
    const lines = sectionText(firms, 'utah').split('\n');
    expect(lines.find((l) => l.includes('First'))?.split('\t')[0]).toBe('1.');
    expect(lines.find((l) => l.includes('Second'))?.split('\t')[0]).toBe('2.');
  });

  it('shows four top markets, not three', () => {
    const block = firstBlock(sectionText([firm()], 'utah'));
    expect(block.map((row) => row[8])).toEqual([
      'Highway', 'Water', 'Telecomm', 'Industrial', '',
    ]);
    expect(block.map((row) => row[9])).toEqual(['67%', '15%', '6%', '4%', '']);
  });

  it('folds the suite and drops a PE on the way to print', () => {
    const text = sectionText([firm({ top_executive: 'Jeffrey S. Watkins, P.E.' })], 'utah');
    expect(text).toContain('2162 W Grove Parkway #100');
    expect(text).not.toContain('STE 100');
    expect(text).toContain('Jeffrey S. Watkins');
    expect(text).not.toContain('P.E.');
  });
});

describe('engineer DND block', () => {
  it('lists DND firms unnumbered, after the ranked ones, by employee count', () => {
    const firms = [
      firm({ firm_name: 'Discloser', revenue_current: '99.00' }),
      firm({ firm_name: 'Small DND', revenue_dnd: 'TRUE', num_employees: '29' }),
      firm({ firm_name: 'Big DND', revenue_dnd: 'TRUE', num_employees: '53' }),
    ];
    const text = sectionText(firms, 'utah');
    expect(text.indexOf('Discloser')).toBeLessThan(text.indexOf('Big DND'));
    expect(text.indexOf('Big DND')).toBeLessThan(text.indexOf('Small DND'));

    const lines = text.split('\n');
    expect(lines.find((l) => l.includes('Big DND'))?.split('\t')[0]).toBe('');
    expect(text).toContain('Firms that Did Not Disclose Revenues (listed by # of employees)');
  });
});

describe('engineer column heads', () => {
  it('words the heads the way last year’s page ran them', () => {
    const lines = sectionText([firm()], 'utah').split('\n');
    const yearRow = lines.find((l) => l.split('\t')[1] === 'Firm Name');
    expect(yearRow?.split('\t')).toEqual([
      '', 'Firm Name', 'Year Est.', 'Top Executive',
      'Largest Project Completed in 2025',
      '2025', '2024', '2023', 'Top Markets', '%',
    ]);
    expect(lines.some((l) => l.split('\t')[4] === 'Largest Project to break ground in 2026')).toBe(true);
    expect(lines.some((l) => l.split('\t')[5] === '(Utah offices)')).toBe(true);
    expect(lines.some((l) => l.split('\t')[1] === 'Phone / Website')).toBe(true);
  });
});
