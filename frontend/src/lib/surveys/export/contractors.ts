/**
 * Contractor survey export.
 *
 * A single firm submission can feed multiple ranked tables, so we emit up to
 * four sections:
 *   - gcOverall:        HQ in Utah, ranked by All U.S. revenue desc
 *   - outOfState:       HQ outside Utah, ranked by All U.S. revenue desc
 *   - generalBuilders:  Utah HQ + discipline_general_building=true, ranked by Utah office revenue desc
 *   - heavyHighwayMuni: Utah HQ + (discipline_heavy_highway OR discipline_municipal_utility), ranked by Utah office revenue desc
 *
 * Per-firm block is 5 lines (matches the printed page where the leftmost
 * column stacks firm/address/city/phone/website and top-markets can show
 * up to 4 entries). Each row has 9 tab-delimited cells.
 *
 * Both .txt and .rtf are emitted for each section so the route can bundle
 * them in a single .zip for the designer.
 */

import {
  type ExportResult,
  type ExportSection,
  type Firm,
  formatPct,
  formatPhone,
  formatRevenue,
  isTrue,
  joinProjectAndLocation,
  normalizeState,
  parseFloat2,
  parseInt2,
  rowsToDicts,
  rtfEscape,
  rtfRow,
  wrapRtf,
} from './shared';

/**
 * Column order in the `Survey Responses - Contractors` sheet. Matches the
 * positional output of `contractorResponseRow` in the responses route.
 */
export const CONTRACTOR_RESPONSE_COLUMNS = [
  'response_id', 'survey_id', 'recipient_id', 'token', 'submitted_at',
  'firm_name', 'year_founded', 'top_executive', 'top_executive_title',
  'years_at_firm', 'address', 'city', 'state', 'zip', 'phone',
  'marketing_email', 'website', 'other_locations',
  'num_employees_ut', 'num_employees_all',
  'discipline_general_building', 'discipline_heavy_highway', 'discipline_municipal_utility',
  'revenue_dnd',
  'revenue_ut_current', 'revenue_ut_prior_1', 'revenue_ut_prior_2',
  'revenue_all_current', 'revenue_all_prior_1', 'revenue_all_prior_2',
  'largest_project_completed', 'largest_project_completed_location',
  'largest_project_upcoming', 'largest_project_upcoming_location',
  'pct_k12', 'pct_higher_ed', 'pct_civic', 'pct_healthcare',
  'pct_multi_family', 'pct_commercial_retail', 'pct_industrial',
  'pct_resort_hospitality', 'pct_sports_rec', 'pct_religious',
  'pct_underground', 'pct_telecomm', 'pct_wastewater', 'pct_heavy_civil',
  'pct_water', 'pct_highway', 'pct_oil_gas', 'pct_power',
  'pct_other', 'other_segment_name',
];

const MARKET_DISPLAY_NAMES: Record<string, string> = {
  pct_k12: 'K-12',
  pct_higher_ed: 'Higher Ed',
  pct_civic: 'Civic/Inst.',
  pct_healthcare: 'Healthcare',
  pct_multi_family: 'Multi-Family',
  pct_commercial_retail: 'Comm/Retail',
  pct_industrial: 'Industrial',
  pct_resort_hospitality: 'Resort/Hosp.',
  pct_sports_rec: 'Sports/Rec',
  pct_religious: 'Religious',
  pct_underground: 'Underground',
  pct_telecomm: 'Telecomm',
  pct_wastewater: 'Wastewater',
  pct_heavy_civil: 'Heavy Civil',
  pct_water: 'Water',
  pct_highway: 'Highway',
  pct_oil_gas: 'Oil & Gas',
  pct_power: 'Power',
};

const TOP_MARKETS_N = 4;

// Column character positions for RTF tab-padding. 9 cells per row; wider
// than the architect layout because the project column has to fit both the
// project name and an em-dashed location.
const CONTRACTOR_COLUMN_POSITIONS = [0, 25, 50, 70, 145, 165, 175, 185, 200];

function getTopMarkets(firm: Firm): [string, number][] {
  const markets: [string, number][] = [];
  for (const [key, displayName] of Object.entries(MARKET_DISPLAY_NAMES)) {
    const pct = parseFloat2(firm[key]);
    if (pct > 0) markets.push([displayName, pct]);
  }
  const otherPct = parseFloat2(firm.pct_other);
  if (otherPct > 0) {
    const label = (firm.other_segment_name || '').trim() || 'Other';
    markets.push([label, otherPct]);
  }
  markets.sort((a, b) => b[1] - a[1]);
  while (markets.length < TOP_MARKETS_N) markets.push(['', 0]);
  return markets.slice(0, TOP_MARKETS_N);
}

function isUtahHq(firm: Firm): boolean {
  return normalizeState(firm.state) === 'UT';
}

function formatEmployees(firm: Firm): string {
  const ut = (firm.num_employees_ut || '').trim();
  const all = (firm.num_employees_all || '').trim();
  if (ut && all) return `${ut}/${all}`;
  if (ut) return ut;
  if (all) return all;
  return '';
}

function headerCells(surveyYear: number): string[][] {
  const prev = surveyYear - 1;
  const prev1 = surveyYear - 2;
  const prev2 = surveyYear - 3;

  return [
    ['', '', '', '', '', 'Annual Revenues (millions)', '', '', ''],
    ['Firm Name', 'Year Est.', 'Top Executive', `Largest Utah Project Completed in ${prev}`, `${prev} (Utah offices)`, `${prev1}`, `${prev2}`, 'Top Markets', '%'],
    ['Address', '# Employees (UT/ALL)', 'Title', `Largest Utah Project Started in ${surveyYear}`, `${prev} (All U.S. offices)`, `${prev1}`, `${prev2}`, '', ''],
    ['', '', 'Years at Firm', '', '', '', '', '', ''],
  ];
}

function firmCells(firm: Firm): string[][] {
  const isDnd = isTrue(firm.revenue_dnd);

  // Utah on line 1, All U.S. on line 2 of the block. When the firm has no
  // out-of-state offices, the All U.S. field is blank and the export emits
  // an empty string (single revenue line in the printed cell).
  const ut2024 = formatRevenue(firm.revenue_ut_current, isDnd);
  const ut2023 = formatRevenue(firm.revenue_ut_prior_1, isDnd);
  const ut2022 = formatRevenue(firm.revenue_ut_prior_2, isDnd);
  const all2024 = formatRevenue(firm.revenue_all_current, isDnd);
  const all2023 = formatRevenue(firm.revenue_all_prior_1, isDnd);
  const all2022 = formatRevenue(firm.revenue_all_prior_2, isDnd);

  const city = (firm.city || '').trim();
  const state = normalizeState(firm.state);
  const zip = (firm.zip || '').trim();
  const cityStateZip = `${city}, ${state} ${zip}`;

  const completedProject = joinProjectAndLocation(
    firm.largest_project_completed,
    firm.largest_project_completed_location,
  );
  const upcomingProject = joinProjectAndLocation(
    firm.largest_project_upcoming,
    firm.largest_project_upcoming_location,
  );

  const topMarkets = getTopMarkets(firm);
  const employees = formatEmployees(firm);

  return [
    [firm.firm_name || '', firm.year_founded || '', firm.top_executive || '',
     completedProject, ut2024, ut2023, ut2022,
     topMarkets[0][0], formatPct(topMarkets[0][1])],
    [firm.address || '', employees, firm.top_executive_title || '',
     upcomingProject, all2024, all2023, all2022,
     topMarkets[1][0], formatPct(topMarkets[1][1])],
    [cityStateZip, '', firm.years_at_firm || '',
     '', '', '', '',
     topMarkets[2][0], formatPct(topMarkets[2][1])],
    [formatPhone(firm.phone), '', '',
     '', '', '', '',
     topMarkets[3][0], formatPct(topMarkets[3][1])],
    [firm.website || '', '', '',
     '', '', '', '',
     '', ''],
  ];
}

/**
 * Build one section's parallel .txt + .rtf. Revenue firms come first sorted
 * by `revenueKey`; DND firms follow, sorted by Utah employee count desc.
 */
function buildSection(args: {
  title: string;
  intro?: string;
  surveyYear: number;
  firms: Firm[];
  revenueKey: 'revenue_ut_current' | 'revenue_all_current';
}): { text: string; rtf: string } {
  const { title, intro, surveyYear, firms, revenueKey } = args;

  const revenueFirms: Firm[] = [];
  const dndFirms: Firm[] = [];
  for (const firm of firms) {
    (isTrue(firm.revenue_dnd) ? dndFirms : revenueFirms).push(firm);
  }
  revenueFirms.sort((a, b) => parseFloat2(b[revenueKey]) - parseFloat2(a[revenueKey]));
  dndFirms.sort(
    (a, b) => parseInt2(b.num_employees_ut) - parseInt2(a.num_employees_ut),
  );

  const txt: string[] = [];
  const rtf: string[] = [];
  const pushText = (s: string) => { txt.push(s); rtf.push(rtfEscape(s)); };
  const pushBlank = () => { txt.push(''); rtf.push(''); };
  const pushHeader = () => {
    for (const row of headerCells(surveyYear)) {
      txt.push(row.join('\t'));
      rtf.push(rtfRow(row, CONTRACTOR_COLUMN_POSITIONS));
    }
  };
  const pushFirm = (firm: Firm) => {
    for (const row of firmCells(firm)) {
      txt.push(row.join('\t'));
      rtf.push(rtfRow(row, CONTRACTOR_COLUMN_POSITIONS));
    }
  };

  pushText(title);
  pushBlank();
  if (intro) {
    pushText(intro);
    pushBlank();
  }
  pushHeader();
  pushBlank();

  for (const firm of revenueFirms) {
    pushFirm(firm);
    pushBlank();
  }

  if (dndFirms.length) {
    pushBlank();
    pushText('Firms that Did Not Disclose Revenues (listed by # of employees)');
    pushBlank();
    pushBlank();
    for (const firm of dndFirms) {
      pushFirm(firm);
      pushBlank();
    }
  }

  return { text: txt.join('\n'), rtf: wrapRtf(rtf) };
}

export function generateContractorExport(
  responses: Firm[],
  surveyYear: number,
): ExportResult {
  const prevYear = surveyYear - 1;

  const utahHq = responses.filter(isUtahHq);
  const outOfStateHq = responses.filter((f) => !isUtahHq(f));

  const generalBuilders = utahHq.filter((f) => isTrue(f.discipline_general_building));
  const heavyHighwayMuni = utahHq.filter(
    (f) => isTrue(f.discipline_heavy_highway) || isTrue(f.discipline_municipal_utility),
  );

  const sections: ExportSection[] = [];

  if (utahHq.length) {
    const built = buildSection({
      title: `${surveyYear} Top Utah General Contractor Rankings`,
      intro:
        `Utah Construction + Design is pleased to publish its annual list of the ` +
        `Top General Contractors in Utah, based on revenues generated in ${prevYear} ` +
        `by firms with offices in Utah. Firms with Utah headquarters are ranked by ` +
        `overall revenues (all U.S. offices). Firms who chose not to disclose ` +
        `revenues (DND) are listed after revenue-disclosing firms based on number ` +
        `of employees.`,
      surveyYear,
      firms: utahHq,
      revenueKey: 'revenue_all_current',
    });
    sections.push({
      key: 'gcOverall',
      label: 'Top Utah General Contractors',
      baseName: `${surveyYear}_ContractorRankings_GC_Overall`,
      text: built.text,
      rtf: built.rtf,
      count: utahHq.length,
    });
  }

  if (outOfStateHq.length) {
    const built = buildSection({
      title: `${surveyYear} Participating Firms with Headquarters Outside Utah`,
      surveyYear,
      firms: outOfStateHq,
      revenueKey: 'revenue_all_current',
    });
    sections.push({
      key: 'outOfState',
      label: 'HQ Outside Utah',
      baseName: `${surveyYear}_ContractorRankings_OutOfState`,
      text: built.text,
      rtf: built.rtf,
      count: outOfStateHq.length,
    });
  }

  if (generalBuilders.length) {
    const built = buildSection({
      title: `${surveyYear} Top Utah General Builders (Ranked by Utah Office Revenues)`,
      surveyYear,
      firms: generalBuilders,
      revenueKey: 'revenue_ut_current',
    });
    sections.push({
      key: 'generalBuilders',
      label: 'Top Utah General Builders',
      baseName: `${surveyYear}_ContractorRankings_GeneralBuilders`,
      text: built.text,
      rtf: built.rtf,
      count: generalBuilders.length,
    });
  }

  if (heavyHighwayMuni.length) {
    const built = buildSection({
      title: `${surveyYear} Top Heavy/Highway & Municipal/Utility (Ranked by Utah Office Revenues)`,
      surveyYear,
      firms: heavyHighwayMuni,
      revenueKey: 'revenue_ut_current',
    });
    sections.push({
      key: 'heavyHighwayMuni',
      label: 'Heavy/Highway & Muni/Utility',
      baseName: `${surveyYear}_ContractorRankings_HeavyHighwayMuni`,
      text: built.text,
      rtf: built.rtf,
      count: heavyHighwayMuni.length,
    });
  }

  return { sections };
}

export function rowsToContractorFirms(rows: string[][]): Firm[] {
  return rowsToDicts(rows, CONTRACTOR_RESPONSE_COLUMNS);
}
