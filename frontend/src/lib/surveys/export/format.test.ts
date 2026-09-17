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

  // The column points at the firm, not at a page. Terracon submitted
  // 'terracon.com/offices/salt-lake-city' and editorial cut it to the domain.
  it('drops the path', () => {
    expect(normalizers.website('https://www.okland.com/about/Team/')).toBe('okland.com');
    expect(normalizers.website('terracon.com/offices/salt-lake-city')).toBe('terracon.com');
  });

  it('passes blanks through', () => {
    expect(normalizers.website('')).toBe('');
    expect(normalizers.website(undefined)).toBe('');
  });

  it('is what the export applies', () => {
    expect(formatWebsite('HTTPS://WWW.Okland.com/')).toBe('okland.com');
  });
});

describe('address normalizer: suite folding', () => {
  it('folds every spelling of a suite to a bare #', () => {
    expect(normalizers.address('756 E Winchester Street STE 400')).toBe('756 E Winchester Street #400');
    expect(normalizers.address('111 E Broadway Suite 600')).toBe('111 E Broadway #600');
    expect(normalizers.address('250 E 200 S Ste. 1000')).toBe('250 E 200 S #1000');
    expect(normalizers.address('1628 W 11010 S Suite #102')).toBe('1628 W 11010 S #102');
    expect(normalizers.address('7090 Union Park Ave # 500')).toBe('7090 Union Park Ave #500');
  });

  it('keeps a lettered suite uppercase rather than title-casing it', () => {
    expect(normalizers.address('6952 High Tech Dr STE B')).toBe('6952 High Tech Dr #B');
  });

  it('leaves an address with no suite alone', () => {
    expect(normalizers.address('2162 W Grove Parkway')).toBe('2162 W Grove Parkway');
    expect(normalizers.address('154 E 14075 S')).toBe('154 E 14075 S');
  });

  it('does not eat street names that merely contain the designator', () => {
    expect(normalizers.address('756 E Winchester St')).toBe('756 E Winchester St');
    expect(normalizers.address('900 Stevens Dr')).toBe('900 Stevens Dr');
  });
});

describe('personName normalizer', () => {
  it('drops a trailing PE in any spelling', () => {
    expect(normalizers.personName('Jeffrey S. Watkins, P.E.')).toBe('Jeffrey S. Watkins');
    expect(normalizers.personName('Clark D. Prothero PE')).toBe('Clark D. Prothero');
    expect(normalizers.personName('Mark Freeman, pe')).toBe('Mark Freeman');
  });

  // Editorial's pass over the 2026 export cut all of these, not just PE.
  it('drops a whole run of credentials', () => {
    expect(normalizers.personName('Brent Crowther, PE, PTOE, RSP1')).toBe('Brent Crowther');
    expect(normalizers.personName('Scott Wilson, SE')).toBe('Scott Wilson');
    expect(normalizers.personName('Justin Naser, SE')).toBe('Justin Naser');
    expect(normalizers.personName('Michael Nadeau, PLS')).toBe('Michael Nadeau');
  });

  it('folds a shouted name', () => {
    expect(normalizers.personName('JARED FORD')).toBe('Jared Ford');
  });

  // A job title typed into the name box is a data-entry problem, not a
  // credential. It survives so editorial can see it and fix the response.
  it('keeps a non-credential part it cannot account for', () => {
    expect(normalizers.personName('JARED FORD, PE, PRINIPAL')).toBe('Jared Ford, Prinipal');
  });

  it('does not chew into a surname ending in those letters', () => {
    expect(normalizers.personName('Anne Poe')).toBe('Anne Poe');
    expect(normalizers.personName('Marc Dupre')).toBe('Marc Dupre');
    expect(normalizers.personName('Sarah Rasmussen')).toBe('Sarah Rasmussen');
  });

  it('passes a plain name and a blank through', () => {
    expect(normalizers.personName('Bryan Foote')).toBe('Bryan Foote');
    expect(normalizers.personName('')).toBe('');
  });
});

describe('title normalizer', () => {
  // Every case here is an edit editorial made by hand to the 2026 export.
  it('joins two titles with a slash', () => {
    expect(normalizers.title('President & CEO')).toBe('President/CEO');
    expect(normalizers.title('President and CEO')).toBe('President/CEO');
    expect(normalizers.title('President - CEO')).toBe('President/CEO');
  });

  it('abbreviates the long forms the page sets short', () => {
    expect(normalizers.title('Senior Vice President')).toBe('Sr. Vice President');
    expect(normalizers.title('Regional Chief Executive')).toBe('Reg. Chief Executive');
    expect(normalizers.title('Local Business Leader')).toBe('Local Bus. Leader');
    expect(normalizers.title('Principal in Charge')).toBe('Principal-in-Charge');
  });

  // 'Senior Principal' ran in full on both the 2025 and 2026 pages.
  it('shortens Senior only where the page shortens it', () => {
    expect(normalizers.title('Senior Principal')).toBe('Senior Principal');
  });

  it('folds a shouted title without flattening acronyms', () => {
    expect(normalizers.title('PRESIDENT')).toBe('President');
    expect(normalizers.title('PRESIDENT/CEO')).toBe('President/CEO');
    expect(normalizers.title('CEO')).toBe('CEO');
    expect(normalizers.title('COO')).toBe('COO');
  });

  it('drops a credential that leads the title', () => {
    expect(normalizers.title('P.E., COO')).toBe('COO');
    expect(normalizers.title('PE, President')).toBe('President');
  });

  // Blanking the column would lose more than the credential costs.
  it('keeps a title that is nothing but a credential', () => {
    expect(normalizers.title('P.E.')).toBe('P.E.');
  });

  it('leaves an already-clean title alone', () => {
    expect(normalizers.title('Vice President')).toBe('Vice President');
    expect(normalizers.title('Managing Partner')).toBe('Managing Partner');
    expect(normalizers.title('Principal-in-Charge')).toBe('Principal-in-Charge');
    expect(normalizers.title('Senior Principal')).toBe('Senior Principal');
    expect(normalizers.title('')).toBe('');
  });
});

describe('properCase normalizer', () => {
  it('folds a shouted city', () => {
    expect(normalizers.properCase('SANDY')).toBe('Sandy');
    expect(normalizers.properCase('SALT LAKE CITY')).toBe('Salt Lake City');
  });

  it('leaves a normally-cased value and a known acronym alone', () => {
    expect(normalizers.properCase('Salt Lake City')).toBe('Salt Lake City');
    expect(normalizers.properCase('SLC')).toBe('SLC');
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
