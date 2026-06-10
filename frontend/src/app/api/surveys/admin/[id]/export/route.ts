import { NextRequest, NextResponse } from 'next/server';
import { getSheetsClient } from '@/lib/google-sheets';
import JSZip from 'jszip';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ── Column definitions (matches Python export script) ──────────────
const RESPONSE_COLUMNS = [
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

// ── Helpers ─────────────────────────────────────────────────────────

function parseFloat2(value: string | undefined, fallback = 0): number {
  if (!value) return fallback;
  const cleaned = String(value).replace(/[$,]/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? fallback : n;
}

function parseInt2(value: string | undefined, fallback = 0): number {
  if (!value) return fallback;
  const cleaned = String(value).replace(/,/g, '').trim();
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? fallback : n;
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  const suffixes: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' };
  return `${n}${suffixes[n % 10] || 'th'}`;
}

function joinProjectAndLocation(
  project: string | undefined,
  location: string | undefined,
): string {
  const p = (project || '').trim();
  const l = (location || '').trim();
  if (p && l) return `${p} — ${l}`;
  return p || l || '';
}

function formatRevenue(value: string | undefined, isDnd: boolean): string {
  if (isDnd) return 'DND';
  if (!value || String(value).trim().toUpperCase() === 'DND') return 'DND';
  const v = parseFloat2(value);
  if (v === 0) return 'DND';
  return `$${v.toFixed(1)}`;
}

function formatPct(value: number): string {
  if (value > 0) return `${Math.round(value)}%`;
  return '';
}

type Firm = Record<string, string>;

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

function rowsToDicts(rows: string[][]): Firm[] {
  if (!rows.length) return [];
  const firstRow = rows[0];
  let headers: string[];
  let dataRows: string[][];

  if (firstRow[0]?.trim().toLowerCase() === 'response_id') {
    headers = firstRow.map((h) => h.trim().toLowerCase());
    dataRows = rows.slice(1);
  } else {
    headers = RESPONSE_COLUMNS;
    dataRows = rows;
  }

  return dataRows.map((row) => {
    const d: Firm = {};
    for (let i = 0; i < headers.length; i++) {
      d[headers[i]] = i < row.length ? row[i] : '';
    }
    return d;
  });
}

// ── Export formatting ───────────────────────────────────────────────

// Header lines as 11-cell arrays (one per row). The first row only fills the
// "Annual Revenues" supertitle cell; the others fill column titles. Empty
// strings are placeholders for cells that have no title on that row but still
// participate in column alignment.
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

function buildHeader(surveyYear: number): string {
  return headerCells(surveyYear).map((row) => row.join('\t')).join('\n');
}

// ── RTF formatting ──────────────────────────────────────────────────
//
// The publication designer's legacy workflow opens an .rtf in InDesign or
// TextEdit, where the document's embedded Courier font + half-inch tab stops
// (\deftab720) lay each row out as an aligned grid. We replicate that here so
// the designer's "Place File" workflow keeps working unchanged.
//
// At Courier 12pt, one tab stop = 720 twips = ~5 characters. Column targets
// below are character positions chosen to give each column enough headroom for
// the widest cell in that column; cells shorter than the column width are
// padded with tabs to reach the next column's start position.

const RTF_TAB_CHARS = 5; // chars per tab stop at Courier 12pt + \deftab720
const ARCH_COLUMN_POSITIONS = [0, 25, 45, 55, 80, 145, 155, 165, 175, 185, 200];

function rtfEscape(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (ch === '\\') out += '\\\\';
    else if (ch === '{') out += '\\{';
    else if (ch === '}') out += '\\}';
    else if (code < 0x20) { /* drop control chars */ }
    else if (code > 0x7F) out += `\\u${code}?`;
    else out += ch;
  }
  return out;
}

// Tabs needed to advance from `currentPos` to (or past) `targetPos`, given
// stops every `RTF_TAB_CHARS` positions. Returns at least 1 so cells always
// have a separator even when content overflows its column.
function tabsToReach(currentPos: number, targetPos: number): { tabs: number; newPos: number } {
  let pos = currentPos;
  let tabs = 0;
  while (pos < targetPos) {
    pos = Math.floor(pos / RTF_TAB_CHARS) * RTF_TAB_CHARS + RTF_TAB_CHARS;
    tabs++;
  }
  if (tabs === 0) {
    // currentPos >= targetPos — content overran its column. Emit one tab so
    // the next column lands at the next stop after where we are.
    pos = Math.floor(currentPos / RTF_TAB_CHARS) * RTF_TAB_CHARS + RTF_TAB_CHARS;
    tabs = 1;
  }
  return { tabs, newPos: pos };
}

function rtfRow(cells: string[], positions: number[]): string {
  let pos = 0;
  let out = '';
  for (let i = 0; i < cells.length; i++) {
    if (i > 0) {
      const { tabs, newPos } = tabsToReach(pos, positions[i] ?? pos + RTF_TAB_CHARS);
      out += '\t'.repeat(tabs);
      pos = newPos;
    }
    const escaped = rtfEscape(cells[i]);
    out += escaped;
    pos += cells[i].length;
  }
  return out;
}

// Wrap a sequence of row strings (each already RTF-escaped + tab-padded) in
// the RTF document envelope. Mirrors the legacy file's header so the designer
// gets the same Courier-12pt + half-inch-tab-stop layout in Place File.
function wrapRtf(rows: string[]): string {
  const header = [
    String.raw`{\rtf1\ansi\ansicpg1252\cocoartf2578`,
    String.raw`\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fmodern\fcharset0 Courier;}`,
    String.raw`{\colortbl;\red255\green255\blue255;}`,
    String.raw`\margl1440\margr1440\vieww30920\viewh17560\viewkind0`,
    String.raw`\deftab720`,
    String.raw`\pard\pardeftab720\sl280\partightenfactor0`,
    String.raw`\f0\fs24 \cf0`,
  ].join('\n');
  // Each row terminates with `\` (RTF line break inside a paragraph). Empty
  // rows are emitted as a single `\` so blank lines survive in the rendered
  // output.
  const body = rows.map((r) => `${r}\\`).join('\n');
  return `${header}\n${body}\n}\n`;
}

// Survey free-text state field has historically been entered as either
// 'UT' or 'Utah' (and possibly with whitespace). Normalize to the 2-letter
// abbreviation everywhere so Utah firms aren't misrouted to out-of-state.
function normalizeState(raw: string | undefined): string {
  const s = (raw || 'UT').trim().toUpperCase();
  if (!s || s === 'UTAH') return 'UT';
  return s;
}

// Each firm spans three 11-cell rows. Returning the cell arrays (rather than
// pre-joined strings) lets both the TXT and RTF formatters reuse the same
// data — they just join differently.
function firmCells(firm: Firm): string[][] {
  const isDnd = String(firm.revenue_dnd || '').toUpperCase() === 'TRUE';

  const revCurrent = formatRevenue(firm.revenue_current, isDnd);
  const revPrior1 = formatRevenue(firm.revenue_prior_1, isDnd);
  const revPrior2 = formatRevenue(firm.revenue_prior_2, isDnd);

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
    [firm.firm_name || '', firm.phone || '', firm.year_founded || '',
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

function formatFirm(firm: Firm): string {
  return firmCells(firm).map((row) => row.join('\t')).join('\n');
}

type ExportFile = { txt: string; rtf: string };

function generateExport(
  responses: Firm[],
  surveyYear: number,
): { utah: ExportFile; outOfState: ExportFile | null } {
  const utahRevenue: Firm[] = [];
  const utahDnd: Firm[] = [];
  const outOfState: Firm[] = [];

  for (const firm of responses) {
    const state = normalizeState(firm.state);
    const isDnd = String(firm.revenue_dnd || '').toUpperCase() === 'TRUE';

    if (state !== 'UT') {
      outOfState.push(firm);
    } else if (isDnd) {
      utahDnd.push(firm);
    } else {
      utahRevenue.push(firm);
    }
  }

  utahRevenue.sort((a, b) => parseFloat2(b.revenue_current) - parseFloat2(a.revenue_current));
  utahDnd.sort((a, b) => parseInt2(b.num_employees) - parseInt2(a.num_employees));

  const prevYear = surveyYear - 1;
  const nth = ordinal(surveyYear - 2012);

  // Walk the firm buckets once and emit both TXT and RTF line-by-line. Both
  // formats share the same logical structure (titles, blank rows, header
  // rows, firm rows \u00d7 3); only the per-row encoding differs.
  const txtLines: string[] = [];
  const rtfLines: string[] = [];

  function pushTextLine(s: string) {
    txtLines.push(s);
    rtfLines.push(rtfEscape(s));
  }
  function pushBlankLine() {
    txtLines.push('');
    rtfLines.push('');
  }
  function pushHeaderRows() {
    for (const row of headerCells(surveyYear)) {
      txtLines.push(row.join('\t'));
      rtfLines.push(rtfRow(row, ARCH_COLUMN_POSITIONS));
    }
  }
  function pushFirmRows(firm: Firm) {
    for (const row of firmCells(firm)) {
      txtLines.push(row.join('\t'));
      rtfLines.push(rtfRow(row, ARCH_COLUMN_POSITIONS));
    }
  }

  pushTextLine(`${surveyYear} Top Utah Architectural Firm Rankings`);
  pushBlankLine();
  pushTextLine(
    `Utah Construction + Design is pleased to publish its ${nth} annual ` +
    `list of the Top Architectural Firms in Utah, based on revenues ` +
    `generated in ${prevYear} by a firm\u2019s Utah offices. Projects ` +
    `outside of Utah that are billed to Utah-based offices are included. ` +
    `Firms who chose not to disclose revenues (DND) are listed after ` +
    `revenue-disclosing firms by number of employees.`,
  );
  pushBlankLine();
  pushHeaderRows();
  pushBlankLine();

  for (const firm of utahRevenue) {
    pushFirmRows(firm);
    pushBlankLine();
  }

  if (utahDnd.length) {
    pushBlankLine();
    pushTextLine('Firms that Did Not Disclose Revenues (listed by # of employees)');
    pushBlankLine();
    pushBlankLine();
    for (const firm of utahDnd) {
      pushFirmRows(firm);
      pushBlankLine();
    }
  }

  const utah: ExportFile = {
    txt: txtLines.join('\n'),
    rtf: wrapRtf(rtfLines),
  };

  let oos: ExportFile | null = null;
  if (outOfState.length) {
    const oosRevenue = outOfState.filter(
      (f) => String(f.revenue_dnd || '').toUpperCase() !== 'TRUE',
    );
    const oosDnd = outOfState.filter(
      (f) => String(f.revenue_dnd || '').toUpperCase() === 'TRUE',
    );
    oosRevenue.sort((a, b) => parseFloat2(b.revenue_current) - parseFloat2(a.revenue_current));
    oosDnd.sort((a, b) => parseInt2(b.num_employees) - parseInt2(a.num_employees));

    const oosTxt: string[] = [];
    const oosRtf: string[] = [];
    function pushOosLine(s: string) { oosTxt.push(s); oosRtf.push(rtfEscape(s)); }
    function pushOosBlank() { oosTxt.push(''); oosRtf.push(''); }
    function pushOosHeader() {
      for (const row of headerCells(surveyYear)) {
        oosTxt.push(row.join('\t'));
        oosRtf.push(rtfRow(row, ARCH_COLUMN_POSITIONS));
      }
    }
    function pushOosFirm(firm: Firm) {
      for (const row of firmCells(firm)) {
        oosTxt.push(row.join('\t'));
        oosRtf.push(rtfRow(row, ARCH_COLUMN_POSITIONS));
      }
    }

    pushOosLine(`${surveyYear} Top Architectural Firm Rankings - Out of State`);
    pushOosBlank();
    pushOosHeader();
    pushOosBlank();

    for (const firm of [...oosRevenue, ...oosDnd]) {
      pushOosFirm(firm);
      pushOosBlank();
    }

    oos = { txt: oosTxt.join('\n'), rtf: wrapRtf(oosRtf) };
  }

  return { utah, outOfState: oos };
}

// ── Route handler ──────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const surveyId = params.id;
    const spreadsheetId = process.env.SURVEY_SHEET_ID;

    if (!spreadsheetId) {
      return NextResponse.json(
        { error: 'Survey system not configured' },
        { status: 500 },
      );
    }

    const sheets = await getSheetsClient(true);

    // Get survey year
    const surveysRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Surveys!A:Z',
    });
    const surveyRows = surveysRes.data.values || [];
    if (surveyRows.length < 2) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    const sHeaders = surveyRows[0];
    const sIdCol = sHeaders.indexOf('survey_id');
    const sYearCol = sHeaders.indexOf('year');

    const surveyRow = surveyRows.slice(1).find((row) => row[sIdCol] === surveyId);
    if (!surveyRow) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }
    const surveyYear = parseInt(surveyRow[sYearCol] || '0', 10);

    // Get responses
    const responsesRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Survey Responses!A:AZ',
    });
    const responseRows = responsesRes.data.values || [];
    const allResponses = rowsToDicts(responseRows);
    const surveyResponses = allResponses.filter((r) => r.survey_id === surveyId);

    if (!surveyResponses.length) {
      return new NextResponse('No responses found for this survey.', {
        status: 404,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    const { utah, outOfState } = generateExport(surveyResponses, surveyYear);

    // Determine format from query param
    const format = request.nextUrl.searchParams.get('format');

    if (format === 'json') {
      // The results-page preview parses the TXT to extract firm names. Keep
      // the JSON shape stable (txt-only) so the preview doesn't need to know
      // about RTF.
      return NextResponse.json({
        utah: utah.txt,
        outOfState: outOfState?.txt ?? null,
      });
    }

    // Default: return a ZIP containing both .txt and .rtf for each file.
    // The designer's InDesign workflow uses the .rtf (Courier + half-inch
    // tab stops embedded, looks aligned in TextEdit); scripts and Convert-
    // Text-to-Table flows use the .txt (single-tab delimited).
    const zip = new JSZip();
    const baseName = `${surveyYear}_ArchRankings`;
    zip.file(`${baseName}.txt`, utah.txt);
    zip.file(`${baseName}.rtf`, utah.rtf);
    if (outOfState) {
      zip.file(`${baseName}_OutOfState.txt`, outOfState.txt);
      zip.file(`${baseName}_OutOfState.rtf`, outOfState.rtf);
    }
    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });
    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${baseName}.zip"`,
      },
    });
  } catch (error: any) {
    console.error('Error exporting survey:', error);
    return NextResponse.json(
      { error: 'Failed to export survey' },
      { status: 500 },
    );
  }
}
