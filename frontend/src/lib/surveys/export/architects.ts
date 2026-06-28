/**
 * Architect survey export — produces the multi-line tab-delimited blocks
 * the designer pastes directly into InDesign.
 *
 * Output sections:
 *   - utah:       firms with state === 'UT' (revenue-disclosing, then DND)
 *   - outOfState: firms with state !== 'UT' (revenue-disclosing, then DND)
 *
 * Per-firm block is 3 lines (matches the printed page layout). Both .txt and
 * .rtf are emitted for each section so the route can bundle them in a single
 * .zip for the designer.
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
  ordinal,
  parseFloat2,
  parseInt2,
  rowsToDicts,
  rtfEscape,
  rtfRow,
  wrapRtf,
} from './shared';

export const ARCHITECT_RESPONSE_COLUMNS = [
  'response_id', 'survey_id', 'recipient_id', 'token', 'submitted_at',
  'firm_name', 'location', 'year_founded', 'top_executive',
  'top_executive_title', 'years_at_firm', 'address', 'city', 'state',
  'zip', 'phone', 'marketing_email', 'website', 'other_locations',
  'num_employees', 'num_licensed_architects', 'num_leed_ap',
  'revenue_current', 'revenue_prior_1', 'revenue_prior_2', 'revenue_dnd',
  'largest_project_completed', 'largest_project_completed_location',
  'largest_project_upcoming', 'largest_project_upcoming_location',
  'pct_k12', 'pct_higher_ed', 'pct_civic', 'pct_healthcare',
  'pct_office', 'pct_resort_hospitality', 'pct_multi_family',
  'pct_commercial_retail', 'pct_sports_rec', 'pct_industrial', 'pct_other',
  'other_segment_name',
];

const MARKET_DISPLAY_NAMES: Record<string, string> = {
  pct_k12: 'K-12',
  pct_higher_ed: 'Higher Ed',
  pct_civic: 'Civic/Inst.',
  pct_healthcare: 'Healthcare',
  pct_office: 'Office',
  pct_resort_hospitality: 'Resort/Hosp.',
  pct_multi_family: 'Multi-Family',
  pct_commercial_retail: 'Comm/Retail',
  pct_sports_rec: 'Sports/Rec',
  pct_industrial: 'Industrial',
  pct_other: 'Other',
};

// Column character positions for RTF tab-padding. Indexed by cell position
// in `firmCells` / `headerCells` (11 cells per row).
const ARCH_COLUMN_POSITIONS = [0, 25, 45, 55, 80, 145, 155, 165, 175, 185, 200];

function getTopMarkets(firm: Firm, n = 3): [string, number][] {
  const markets: [string, number][] = [];
  const customOther = (firm.other_segment_name || '').trim();
  for (const [key, displayName] of Object.entries(MARKET_DISPLAY_NAMES)) {
    const pct = parseFloat2(firm[key]);
    if (pct > 0) {
      const name = key === 'pct_other' && customOther ? customOther : displayName;
      markets.push([name, pct]);
    }
  }
  markets.sort((a, b) => b[1] - a[1]);
  while (markets.length < n) markets.push(['', 0]);
  return markets.slice(0, n);
}

function headerCells(surveyYear: number): string[][] {
  const prev = surveyYear - 1;
  const prev1 = surveyYear - 2;
  const prev2 = surveyYear - 3;

  return [
    ['', '', '', '', '', '', 'Annual Revenues (millions)', '', '', '', ''],
    ['Firm Name', 'Phone', 'Year Est.', 'Top Executive', `Largest Utah Project to Finish in ${prev}`, '# Employees', `${prev}`, `${prev1}`, `${prev2}`, 'Top Markets', '%'],
    ['Address', 'Website', '', 'Title', `Largest Utah Project to Start in ${surveyYear}`, '# Lic. Archs', '', '', '', '', ''],
    ['', '', '', 'Years at Firm', '', '# LEED AP', '', '', '', '', ''],
  ];
}

function firmCells(firm: Firm): string[][] {
  const isDnd = isTrue(firm.revenue_dnd);

  const revCurrent = formatRevenue(firm.revenue_current, isDnd) || 'DND';
  const revPrior1 = formatRevenue(firm.revenue_prior_1, isDnd) || 'DND';
  const revPrior2 = formatRevenue(firm.revenue_prior_2, isDnd) || 'DND';

  const city = (firm.city || '').trim();
  const state = normalizeState(firm.state);
  const zip = (firm.zip || '').trim();
  const cityStateZip = `${city}, ${state} ${zip}`;

  const topMarkets = getTopMarkets(firm);

  const completedProject = joinProjectAndLocation(
    firm.largest_project_completed,
    firm.largest_project_completed_location,
  );
  const upcomingProject = joinProjectAndLocation(
    firm.largest_project_upcoming,
    firm.largest_project_upcoming_location,
  );

  return [
    [firm.firm_name || '', formatPhone(firm.phone), firm.year_founded || '',
     firm.top_executive || '', completedProject,
     firm.num_employees || '', revCurrent, revPrior1, revPrior2,
     topMarkets[0][0], formatPct(topMarkets[0][1])],
    [firm.address || '', firm.website || '', '',
     firm.top_executive_title || '', upcomingProject,
     firm.num_licensed_architects || '', '', '', '',
     topMarkets[1][0], formatPct(topMarkets[1][1])],
    [cityStateZip, '', '', firm.years_at_firm || '', '',
     firm.num_leed_ap || '', '', '', '',
     topMarkets[2][0], formatPct(topMarkets[2][1])],
  ];
}

/**
 * Emit one section as parallel .txt and .rtf strings. Walks the firm buckets
 * once and pushes to both buffers line-by-line so the two formats can never
 * drift out of sync.
 */
function buildSection(args: {
  title: string;
  intro?: string;
  surveyYear: number;
  revenueFirms: Firm[];
  dndFirms: Firm[];
}): { text: string; rtf: string } {
  const { title, intro, surveyYear, revenueFirms, dndFirms } = args;
  const txt: string[] = [];
  const rtf: string[] = [];

  const pushText = (s: string) => { txt.push(s); rtf.push(rtfEscape(s)); };
  const pushBlank = () => { txt.push(''); rtf.push(''); };
  const pushHeader = () => {
    for (const row of headerCells(surveyYear)) {
      txt.push(row.join('\t'));
      rtf.push(rtfRow(row, ARCH_COLUMN_POSITIONS));
    }
  };
  const pushFirm = (firm: Firm) => {
    for (const row of firmCells(firm)) {
      txt.push(row.join('\t'));
      rtf.push(rtfRow(row, ARCH_COLUMN_POSITIONS));
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

export function generateArchitectExport(
  responses: Firm[],
  surveyYear: number,
): ExportResult {
  const utahRevenue: Firm[] = [];
  const utahDnd: Firm[] = [];
  const outOfStateRevenue: Firm[] = [];
  const outOfStateDnd: Firm[] = [];

  for (const firm of responses) {
    const state = normalizeState(firm.state);
    const isDnd = isTrue(firm.revenue_dnd);
    if (state !== 'UT') {
      (isDnd ? outOfStateDnd : outOfStateRevenue).push(firm);
    } else {
      (isDnd ? utahDnd : utahRevenue).push(firm);
    }
  }

  utahRevenue.sort((a, b) => parseFloat2(b.revenue_current) - parseFloat2(a.revenue_current));
  utahDnd.sort((a, b) => parseInt2(b.num_employees) - parseInt2(a.num_employees));
  outOfStateRevenue.sort((a, b) => parseFloat2(b.revenue_current) - parseFloat2(a.revenue_current));
  outOfStateDnd.sort((a, b) => parseInt2(b.num_employees) - parseInt2(a.num_employees));

  const prevYear = surveyYear - 1;
  const nth = ordinal(surveyYear - 2012);

  const sections: ExportSection[] = [];

  if (utahRevenue.length + utahDnd.length > 0) {
    const built = buildSection({
      title: `${surveyYear} Top Utah Architectural Firm Rankings`,
      intro:
        `Utah Construction + Design is pleased to publish its ${nth} annual ` +
        `list of the Top Architectural Firms in Utah, based on revenues ` +
        `generated in ${prevYear} by a firm’s Utah offices. Projects ` +
        `outside of Utah that are billed to Utah-based offices are included. ` +
        `Firms who chose not to disclose revenues (DND) are listed after ` +
        `revenue-disclosing firms by number of employees.`,
      surveyYear,
      revenueFirms: utahRevenue,
      dndFirms: utahDnd,
    });
    sections.push({
      key: 'utah',
      label: 'Utah Firms',
      baseName: `${surveyYear}_ArchRankings`,
      text: built.text,
      rtf: built.rtf,
      count: utahRevenue.length + utahDnd.length,
    });
  }

  if (outOfStateRevenue.length + outOfStateDnd.length > 0) {
    const built = buildSection({
      title: `${surveyYear} Top Architectural Firm Rankings - Out of State`,
      surveyYear,
      revenueFirms: outOfStateRevenue,
      dndFirms: outOfStateDnd,
    });
    sections.push({
      key: 'outOfState',
      label: 'Out of State',
      baseName: `${surveyYear}_ArchRankings_OutOfState`,
      text: built.text,
      rtf: built.rtf,
      count: outOfStateRevenue.length + outOfStateDnd.length,
    });
  }

  return { sections };
}

export function rowsToArchitectFirms(rows: string[][]): Firm[] {
  return rowsToDicts(rows, ARCHITECT_RESPONSE_COLUMNS);
}
