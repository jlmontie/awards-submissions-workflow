/**
 * Engineering firm survey export.
 *
 * The printed engineering page is laid out like the GC page, not the
 * architect page: a 5-line per-firm block whose leftmost column stacks
 * firm / address / city / phone / website, and up to four top markets down
 * the right.
 *
 * Output is ONE document, holding the four tables in the order they run in
 * print. The editor forwards a single file to the designer, so the tables
 * must not be split across a zip:
 *
 *   1. Top Overall      every firm, ranked by Utah office revenue desc
 *   2. Top Civil        discipline_civil, re-ranked within the discipline
 *   3. Top MEP          discipline_mep
 *   4. Top Structural   discipline_structural
 *
 * A firm appears in the overall table and again in each discipline it
 * selected — that is what the survey's Discipline section is for. Each table
 * repeats the column heads and numbers its own firms from 1.
 *
 * Revenue-disclosing firms are numbered 1..n; DND firms follow in an
 * unnumbered block sorted by employee count, the way the page sets them.
 *
 * Firms headquartered outside Utah rank inline with everyone else, on their
 * Utah office revenues — as they do in print, where AECOM, WSP, Kimley-Horn,
 * Michael Baker and Terracon all sit in the main list.
 *
 * Both .txt and .rtf are emitted so the route can serve the .rtf for the
 * designer's Place File workflow and the preview pane can show the text.
 */

import {
  type ExportResult,
  type ExportSection,
  type Firm,
  formatAddress,
  formatCity,
  formatCount,
  formatPct,
  formatPersonName,
  formatPhone,
  formatRevenue,
  formatTitle,
  formatWebsite,
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

/**
 * Column order in the `Survey Responses - Engineers` sheet. Matches the
 * positional output of `engineerResponseRow` in the responses route.
 */
// `pct_data_centers` and the `discipline_*` columns are appended after
// `other_segment_name` rather than slotted in with related fields: the row
// writer is positional, so a mid-list insert would shift every later column of
// the sheets already holding responses. Form order is independent of column
// order.
export const ENGINEER_RESPONSE_COLUMNS = [
  'response_id', 'survey_id', 'recipient_id', 'token', 'submitted_at',
  'firm_name', 'location', 'year_founded', 'top_executive',
  'top_executive_title', 'years_at_firm', 'address', 'city', 'state',
  'zip', 'phone', 'marketing_email', 'website', 'other_locations',
  'num_employees',
  'revenue_current', 'revenue_prior_1', 'revenue_prior_2', 'revenue_dnd',
  'largest_project_completed', 'largest_project_completed_location',
  'largest_project_upcoming', 'largest_project_upcoming_location',
  'pct_k12', 'pct_higher_ed', 'pct_civic', 'pct_healthcare',
  'pct_office', 'pct_resort_hospitality', 'pct_multi_family',
  'pct_commercial_retail', 'pct_sports_rec', 'pct_industrial',
  'pct_highway', 'pct_underground', 'pct_telecomm', 'pct_water',
  'pct_wastewater', 'pct_other', 'other_segment_name',
  'pct_data_centers',
  'discipline_civil', 'discipline_mep', 'discipline_structural',
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
  pct_highway: 'Highway',
  pct_underground: 'Underground',
  pct_telecomm: 'Telecomm',
  pct_water: 'Water',
  pct_wastewater: 'Wastewater',
  pct_data_centers: 'Data Centers',
  pct_other: 'Other',
};

// Top markets shown per firm. Four, because the printed block is five lines
// tall and the markets run down lines 1-4 — the same as the GC page. (This
// was 3 while the export was modelled on the 3-line architect block, which
// silently dropped each firm's fourth market.)
const TOP_MARKETS_N = 4;

// Column character positions for RTF tab-padding. Indexed by cell position in
// `firmCells` / `headerCells` (10 cells per row). Cell 0 is the rank number,
// which hangs in the margin left of the firm name the way the page sets it.
// The project column is wide because it carries the project name plus an
// em-dashed location.
const ENGINEER_COLUMN_POSITIONS = [0, 5, 40, 55, 85, 170, 180, 190, 200, 220];

function getTopMarkets(firm: Firm, n = TOP_MARKETS_N): [string, number][] {
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

// Column heads are worded as they ran in print last year, with the years
// rolled forward: 'Largest Project Completed in <prev>' over 'Largest Project
// to break ground in <year>'. The page drops 'Utah' from both heads — the
// intro and the '(Utah offices)' note under the revenue columns already say
// the whole list is Utah-only.
function headerCells(surveyYear: number): string[][] {
  const prev = surveyYear - 1;
  const prev1 = surveyYear - 2;
  const prev2 = surveyYear - 3;

  return [
    ['', '', '', '', '', 'Annual Revenues (millions)', '', '', '', ''],
    ['', 'Firm Name', 'Year Est.', 'Top Executive', `Largest Project Completed in ${prev}`, `${prev}`, `${prev1}`, `${prev2}`, 'Top Markets', '%'],
    ['', 'Address (HQ)', '# of Employees', 'Title', `Largest Project to break ground in ${surveyYear}`, '(Utah offices)', '', '', '', ''],
    ['', 'Phone / Website', 'Years at Firm', '', '', '', '', '', '', ''],
  ];
}

/**
 * One firm's 5-line block. `rank` is the printed ranking number ('1.'), or
 * an empty string for DND firms, which the page lists unnumbered.
 */
function firmCells(firm: Firm, rank: string): string[][] {
  const isDnd = isTrue(firm.revenue_dnd);

  const revCurrent = formatRevenue(firm.revenue_current, isDnd) || 'DND';
  const revPrior1 = formatRevenue(firm.revenue_prior_1, isDnd) || 'DND';
  const revPrior2 = formatRevenue(firm.revenue_prior_2, isDnd) || 'DND';

  const city = formatCity(firm.city);
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
    [rank, firm.firm_name || '', firm.year_founded || '',
     formatPersonName(firm.top_executive), completedProject,
     revCurrent, revPrior1, revPrior2,
     topMarkets[0][0], formatPct(topMarkets[0][1])],
    ['', formatAddress(firm.address), formatCount(firm.num_employees),
     formatTitle(firm.top_executive_title), upcomingProject,
     '', '', '',
     topMarkets[1][0], formatPct(topMarkets[1][1])],
    ['', cityStateZip, firm.years_at_firm || '', '', '',
     '', '', '',
     topMarkets[2][0], formatPct(topMarkets[2][1])],
    ['', formatPhone(firm.phone), '', '', '',
     '', '', '',
     topMarkets[3][0], formatPct(topMarkets[3][1])],
    ['', formatWebsite(firm.website), '', '', '',
     '', '', '', '', ''],
  ];
}

/** Split a discipline's firms into the ranked block and the DND block. */
function splitAndSort(firms: Firm[]): { revenueFirms: Firm[]; dndFirms: Firm[] } {
  const revenueFirms: Firm[] = [];
  const dndFirms: Firm[] = [];
  for (const firm of firms) {
    (isTrue(firm.revenue_dnd) ? dndFirms : revenueFirms).push(firm);
  }
  revenueFirms.sort(
    (a, b) => parseFloat2(b.revenue_current) - parseFloat2(a.revenue_current),
  );
  dndFirms.sort((a, b) => parseInt2(b.num_employees) - parseInt2(a.num_employees));
  return { revenueFirms, dndFirms };
}


/**
 * Paired .txt / .rtf line buffers. Every push writes to both at once, so the
 * two renderings of the same document can never drift out of sync.
 */
function createBuffers() {
  const txt: string[] = [];
  const rtf: string[] = [];
  return {
    txt,
    rtf,
    /** A run of prose — title, heading, intro paragraph. */
    line(s: string) { txt.push(s); rtf.push(rtfEscape(s)); },
    blank() { txt.push(''); rtf.push(''); },
    /** One tab-delimited grid row. */
    row(cells: string[]) {
      txt.push(cells.join('\t'));
      rtf.push(rtfRow(cells, ENGINEER_COLUMN_POSITIONS));
    },
  };
}

type Buffers = ReturnType<typeof createBuffers>;

const DND_HEADING = 'Firms that Did Not Disclose Revenues (listed by # of employees)';

/**
 * One ranked table: heading, column heads, numbered firms, then the
 * unnumbered DND block. Each table repeats the column heads, because the
 * printed page repeats them above every table.
 */
function pushTable(
  buf: Buffers,
  args: { heading: string; surveyYear: number; firms: Firm[] },
): void {
  const { heading, surveyYear, firms } = args;
  const { revenueFirms, dndFirms } = splitAndSort(firms);

  buf.line(heading);
  buf.blank();
  for (const row of headerCells(surveyYear)) buf.row(row);
  buf.blank();

  revenueFirms.forEach((firm, i) => {
    for (const row of firmCells(firm, `${i + 1}.`)) buf.row(row);
    buf.blank();
  });

  if (dndFirms.length) {
    buf.blank();
    buf.line(DND_HEADING);
    buf.blank();
    buf.blank();
    for (const firm of dndFirms) {
      for (const row of firmCells(firm, '')) buf.row(row);
      buf.blank();
    }
  }
}

// Discipline tables, in the order they run in print, after the overall table.
const DISCIPLINE_TABLES: { flag: string; heading: string }[] = [
  { flag: 'discipline_civil', heading: 'Top Civil Engineering Firms' },
  { flag: 'discipline_mep', heading: 'Top MEP (Mechanical + Electrical) Engineering Firms' },
  { flag: 'discipline_structural', heading: 'Top Structural Engineering Firms' },
];

/** The whole list as one document: title, intro, then the four tables. */
function buildDocument(
  firms: Firm[],
  surveyYear: number,
): { text: string; rtf: string } {
  const buf = createBuffers();
  const prevYear = surveyYear - 1;
  const nth = ordinal(surveyYear - 2012);

  buf.line(`${surveyYear} Top Utah Engineering Firm Rankings`);
  buf.blank();
  buf.line(
    `Utah Construction + Design is pleased to publish its ${nth} annual ` +
    `list of the Top Engineering Firms in Utah, based on revenues generated ` +
    `in ${prevYear} by a firm’s Utah offices. Projects outside of Utah that ` +
    `are billed to Utah-based offices are included. Firms headquartered ` +
    `outside Utah may participate; only revenues generated by their Utah ` +
    `offices count toward the rankings. Firms who chose not to disclose ` +
    `revenues (DND) are listed after revenue-disclosing firms by number of ` +
    `employees. Every effort was made to contact respective firms and ` +
    `encourage participation.`,
  );
  buf.blank();

  pushTable(buf, {
    heading:
      'Top Overall Engineering Firms ' +
      '(Ranked by Total Office Revenues; All Disciplines)',
    surveyYear,
    firms,
  });

  for (const { flag, heading } of DISCIPLINE_TABLES) {
    const disciplineFirms = firms.filter((f) => isTrue(f[flag]));
    // A discipline nobody selected is skipped rather than set as an empty
    // table under a heading.
    if (!disciplineFirms.length) continue;
    buf.blank();
    buf.blank();
    pushTable(buf, { heading, surveyYear, firms: disciplineFirms });
  }

  return { text: buf.txt.join('\n'), rtf: wrapRtf(buf.rtf) };
}

export function generateEngineerExport(
  responses: Firm[],
  surveyYear: number,
): ExportResult {
  if (!responses.length) return { sections: [] };

  const built = buildDocument(responses, surveyYear);
  const section: ExportSection = {
    key: 'rankings',
    label: 'Engineering Rankings',
    baseName: `${surveyYear}_EngRankings`,
    text: built.text,
    rtf: built.rtf,
    count: responses.length,
  };
  return { sections: [section] };
}

export function rowsToEngineerFirms(rows: string[][]): Firm[] {
  return rowsToDicts(rows, ENGINEER_RESPONSE_COLUMNS);
}
