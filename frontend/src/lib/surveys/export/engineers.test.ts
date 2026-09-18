import { describe, it, expect } from 'vitest';
import { generateEngineerExport } from './engineers';
import type { Firm } from './shared';

/**
 * The engineering page had been exporting in the architect's 3-line shape:
 * no discipline tables, no ranking numbers, phone and website in the second
 * column, and only three top markets. The printed page is the GC shape, and
 * it is one continuous list the editor hands to the designer as a single
 * file. Each of those is pinned here, because the export builds either way.
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

const OVERALL = 'Top Overall Engineering Firms (Ranked by Total Office Revenues; All Disciplines)';
const CIVIL = 'Top Civil Engineering Firms';
const MEP = 'Top MEP (Mechanical + Electrical) Engineering Firms';
const STRUCTURAL = 'Top Structural Engineering Firms';
const HEADINGS = [OVERALL, CIVIL, MEP, STRUCTURAL];

/** The whole export, which is a single document. */
function doc(firms: Firm[]): string {
  const { sections } = generateEngineerExport(firms, 2026);
  if (sections.length !== 1) throw new Error(`expected 1 section, got ${sections.length}`);
  return sections[0].text;
}

/** One table sliced out of the document, up to the next table's heading. */
function table(text: string, heading: string): string {
  const start = text.indexOf(heading);
  if (start === -1) throw new Error(`no table: ${heading}`);
  const after = start + heading.length;
  const next = HEADINGS
    .map((h) => text.indexOf(h, after))
    .filter((i) => i !== -1);
  return text.slice(start, next.length ? Math.min(...next) : text.length);
}

/** The 5 tab-delimited lines of the first firm block in a table. */
function firstBlock(tableText: string): string[][] {
  const lines = tableText.split('\n');
  const headerAt = lines.findIndex((l) => l.split('\t')[1] === 'Phone / Website');
  const start = lines.findIndex((l, i) => i > headerAt && l.trim() !== '');
  return lines.slice(start, start + 5).map((l) => l.split('\t'));
}

describe('engineer export document', () => {
  it('is a single file, not one per table', () => {
    const { sections } = generateEngineerExport(
      [
        firm({ firm_name: 'Civil Co', discipline_civil: 'TRUE' }),
        firm({ firm_name: 'MEP Co', discipline_civil: '', discipline_mep: 'TRUE' }),
      ],
      2026,
    );
    expect(sections).toHaveLength(1);
    expect(sections[0].baseName).toBe('2026_EngRankings');
  });

  it('runs the tables in the order they run in print', () => {
    const text = doc([
      firm({ firm_name: 'Struct Co', discipline_civil: '', discipline_structural: 'TRUE' }),
      firm({ firm_name: 'MEP Co', discipline_civil: '', discipline_mep: 'TRUE' }),
      firm({ firm_name: 'Civil Co', discipline_civil: 'TRUE' }),
    ]);
    const order = HEADINGS.map((h) => text.indexOf(h));
    expect(order.every((i) => i !== -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('carries the title and intro once, above the first table', () => {
    const text = doc([firm()]);
    expect(text.indexOf('2026 Top Utah Engineering Firm Rankings')).toBe(0);
    expect(text.match(/14th annual/g)).toHaveLength(1);
    expect(text.indexOf('14th annual')).toBeLessThan(text.indexOf(OVERALL));
  });

  it('repeats the column heads above every table', () => {
    const text = doc([
      firm({ firm_name: 'Civil Co', discipline_civil: 'TRUE' }),
      firm({ firm_name: 'MEP Co', discipline_civil: '', discipline_mep: 'TRUE' }),
    ]);
    expect(text.match(/Phone \/ Website/g)).toHaveLength(3); // overall + civil + mep
  });

  it('skips a discipline nobody selected', () => {
    const text = doc([firm()]);
    expect(text).toContain(CIVIL);
    expect(text).not.toContain(MEP);
    expect(text).not.toContain(STRUCTURAL);
  });
});

describe('engineer discipline tables', () => {
  it('lists a firm in the overall table and again in its own discipline', () => {
    const text = doc([
      firm({ firm_name: 'Civil Co', discipline_civil: 'TRUE' }),
      firm({ firm_name: 'MEP Co', discipline_civil: '', discipline_mep: 'TRUE' }),
    ]);
    expect(table(text, OVERALL)).toContain('Civil Co');
    expect(table(text, OVERALL)).toContain('MEP Co');
    expect(table(text, CIVIL)).toContain('Civil Co');
    expect(table(text, CIVIL)).not.toContain('MEP Co');
  });

  it('re-ranks within a discipline rather than carrying overall positions', () => {
    const text = doc([
      firm({ firm_name: 'Big MEP', revenue_current: '500.00', discipline_civil: '', discipline_mep: 'TRUE' }),
      firm({ firm_name: 'Alpha Civil', revenue_current: '400.00', discipline_civil: 'TRUE' }),
      firm({ firm_name: 'Small Civil', revenue_current: '10.00', discipline_civil: 'TRUE' }),
    ]);
    const civil = table(text, CIVIL).split('\n');
    expect(civil.find((l) => l.includes('Alpha Civil'))?.split('\t')[0]).toBe('1.');
    expect(civil.find((l) => l.includes('Small Civil'))?.split('\t')[0]).toBe('2.');
  });
});

describe('out-of-state firms', () => {
  it('ranks inline with everyone else rather than in a section of their own', () => {
    const firms = [
      firm({ firm_name: 'Utah Co', revenue_current: '100.00' }),
      firm({ firm_name: 'National Co', state: 'TX', city: 'Dallas', zip: '75201', revenue_current: '200.00' }),
      firm({ firm_name: 'Small Utah Co', revenue_current: '10.00' }),
    ];
    const { sections } = generateEngineerExport(firms, 2026);
    expect(sections).toHaveLength(1);

    const overall = table(sections[0].text, OVERALL).split('\n');
    expect(overall.find((l) => l.includes('National Co'))?.split('\t')[0]).toBe('1.');
    expect(overall.find((l) => l.includes('Utah Co'))?.split('\t')[0]).toBe('2.');
    expect(overall.find((l) => l.includes('Small Utah Co'))?.split('\t')[0]).toBe('3.');
  });

  it('keeps the real state in the city line', () => {
    const text = doc([firm({ state: 'TX', city: 'Dallas', zip: '75201' })]);
    expect(text).toContain('Dallas, TX 75201');
  });
});

describe('engineer firm block', () => {
  it('is 5 lines with the left column stacking firm/address/city/phone/website', () => {
    const block = firstBlock(table(doc([firm()]), OVERALL));
    expect(block.map((row) => row[1])).toEqual([
      'Test Engineers',
      '2162 W Grove Parkway #100',
      'Pleasant Grove, UT 84062',
      '801-763-5100',
      'horrocks.com',
    ]);
  });

  it('stacks year est. / employees in the second column', () => {
    const block = firstBlock(table(doc([firm()]), OVERALL));
    expect(block.map((row) => row[2])).toEqual(['1968', '627', '', '', '']);
  });

  it('stacks top executive / title / years at firm in the third column', () => {
    const block = firstBlock(table(doc([firm()]), OVERALL));
    expect(block.map((row) => row[3])).toEqual(['Bryan Foote', 'President', '35', '', '']);
  });

  it('numbers the ranked firms', () => {
    const lines = table(doc([
      firm({ firm_name: 'First', revenue_current: '99.00' }),
      firm({ firm_name: 'Second', revenue_current: '50.00' }),
    ]), OVERALL).split('\n');
    expect(lines.find((l) => l.includes('First'))?.split('\t')[0]).toBe('1.');
    expect(lines.find((l) => l.includes('Second'))?.split('\t')[0]).toBe('2.');
  });

  it('shows four top markets, not three', () => {
    const block = firstBlock(table(doc([firm()]), OVERALL));
    expect(block.map((row) => row[8])).toEqual([
      'Highway', 'Water', 'Telecomm', 'Industrial', '',
    ]);
    expect(block.map((row) => row[9])).toEqual(['67%', '15%', '6%', '4%', '']);
  });

  it('folds the suite and drops a PE on the way to print', () => {
    const text = doc([firm({ top_executive: 'Jeffrey S. Watkins, P.E.' })]);
    expect(text).toContain('2162 W Grove Parkway #100');
    expect(text).not.toContain('STE 100');
    expect(text).toContain('Jeffrey S. Watkins');
    expect(text).not.toContain('P.E.');
  });
});

describe('engineer DND block', () => {
  it('lists DND firms unnumbered, after the ranked ones, by employee count', () => {
    const text = table(doc([
      firm({ firm_name: 'Discloser', revenue_current: '99.00' }),
      firm({ firm_name: 'Small DND', revenue_dnd: 'TRUE', num_employees: '29' }),
      firm({ firm_name: 'Big DND', revenue_dnd: 'TRUE', num_employees: '53' }),
    ]), OVERALL);

    expect(text.indexOf('Discloser')).toBeLessThan(text.indexOf('Big DND'));
    expect(text.indexOf('Big DND')).toBeLessThan(text.indexOf('Small DND'));

    const lines = text.split('\n');
    expect(lines.find((l) => l.includes('Big DND'))?.split('\t')[0]).toBe('');
    expect(text).toContain('Firms that Did Not Disclose Revenues (listed by # of employees)');
  });

  it('gives each table its own DND block', () => {
    const text = doc([
      firm({ firm_name: 'Civil DND', revenue_dnd: 'TRUE', num_employees: '29' }),
      firm({ firm_name: 'Struct DND', revenue_dnd: 'TRUE', num_employees: '40', discipline_civil: '', discipline_structural: 'TRUE' }),
    ]);
    expect(table(text, CIVIL)).toContain('Civil DND');
    expect(table(text, CIVIL)).not.toContain('Struct DND');
    expect(table(text, STRUCTURAL)).toContain('Struct DND');
  });
});

describe('engineer column heads', () => {
  it('words the heads the way last year’s page ran them', () => {
    const lines = doc([firm()]).split('\n');
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
