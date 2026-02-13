import { NextRequest, NextResponse } from 'next/server';
import { getSheetsClient } from '@/lib/google-sheets';

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
  'largest_project_completed', 'largest_project_upcoming',
  'pct_k12', 'pct_higher_ed', 'pct_civic', 'pct_healthcare',
  'pct_office', 'pct_resort_hospitality', 'pct_multi_family',
  'pct_commercial_retail', 'pct_sports_rec', 'pct_industrial', 'pct_other',
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
  for (const [key, displayName] of Object.entries(MARKET_DISPLAY_NAMES)) {
    const pct = parseFloat2(firm[key]);
    if (pct > 0) markets.push([displayName, pct]);
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

function buildHeader(surveyYear: number): string {
  const prev = surveyYear - 1;
  const prev1 = surveyYear - 2;
  const prev2 = surveyYear - 3;

  return [
    '\t\t\t\t\t\tAnnual Revenues (millions)',
    `Firm Name\tPhone\tYear Est.\tTop Executive\tLargest Project to Finish in ${prev}\t# Employees\t${prev}\t${prev1}\t${prev2}\tTop Markets\t%`,
    `Address\tWebsite\t\tTitle\tLargest Project to Start in ${surveyYear}\t# Lic. Archs`,
    '\t\t\tYears at Firm\t\t# LEED AP',
  ].join('\n');
}

function formatFirm(firm: Firm): string {
  const isDnd = String(firm.revenue_dnd || '').toUpperCase() === 'TRUE';

  const revCurrent = formatRevenue(firm.revenue_current, isDnd);
  const revPrior1 = formatRevenue(firm.revenue_prior_1, isDnd);
  const revPrior2 = formatRevenue(firm.revenue_prior_2, isDnd);

  const city = (firm.city || '').trim();
  const state = (firm.state || 'UT').trim().toUpperCase() || 'UT';
  const zip = (firm.zip || '').trim();
  const cityStateZip = `${city}, ${state} ${zip}`;

  const topMarkets = getTopMarkets(firm);

  return [
    [firm.firm_name || '', firm.phone || '', firm.year_founded || '',
     firm.top_executive || '', firm.largest_project_completed || '',
     firm.num_employees || '', revCurrent, revPrior1, revPrior2,
     topMarkets[0][0], formatPct(topMarkets[0][1])].join('\t'),
    [firm.address || '', firm.website || '', '',
     firm.top_executive_title || '', firm.largest_project_upcoming || '',
     firm.num_licensed_architects || '', '', '', '',
     topMarkets[1][0], formatPct(topMarkets[1][1])].join('\t'),
    [cityStateZip, '', '', firm.years_at_firm || '', '',
     firm.num_leed_ap || '', '', '', '',
     topMarkets[2][0], formatPct(topMarkets[2][1])].join('\t'),
  ].join('\n');
}

function generateExport(
  responses: Firm[],
  surveyYear: number,
): { utah: string; outOfState: string | null } {
  const utahRevenue: Firm[] = [];
  const utahDnd: Firm[] = [];
  const outOfState: Firm[] = [];

  for (const firm of responses) {
    const state = (firm.state || 'UT').trim().toUpperCase() || 'UT';
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

  const parts: string[] = [];
  parts.push(`${surveyYear} Top Utah Architectural Firm Rankings`);
  parts.push('');
  parts.push(
    `Utah Construction & Design is pleased to publish its ${nth} annual ` +
    `list of the Top Architectural Firms in Utah, based on revenues ` +
    `generated in ${prevYear} by a firm\u2019s Utah offices. Projects ` +
    `outside of Utah that are billed to Utah-based offices are included. ` +
    `Firms who chose not to disclose revenues (DND) are listed after ` +
    `revenue-disclosing firms by number of employees.`,
  );
  parts.push('');
  parts.push(buildHeader(surveyYear));
  parts.push('');

  for (const firm of utahRevenue) {
    parts.push(formatFirm(firm));
    parts.push('');
  }

  if (utahDnd.length) {
    parts.push('');
    parts.push('Firms that Did Not Disclose Revenues (listed by # of employees)');
    parts.push('');
    parts.push('');
    for (const firm of utahDnd) {
      parts.push(formatFirm(firm));
      parts.push('');
    }
  }

  const utahText = parts.join('\n');

  let oosText: string | null = null;
  if (outOfState.length) {
    const oosRevenue = outOfState.filter(
      (f) => String(f.revenue_dnd || '').toUpperCase() !== 'TRUE',
    );
    const oosDnd = outOfState.filter(
      (f) => String(f.revenue_dnd || '').toUpperCase() === 'TRUE',
    );
    oosRevenue.sort((a, b) => parseFloat2(b.revenue_current) - parseFloat2(a.revenue_current));
    oosDnd.sort((a, b) => parseInt2(b.num_employees) - parseInt2(a.num_employees));

    const oosParts: string[] = [];
    oosParts.push(`${surveyYear} Top Architectural Firm Rankings - Out of State`);
    oosParts.push('');
    oosParts.push(buildHeader(surveyYear));
    oosParts.push('');

    for (const firm of [...oosRevenue, ...oosDnd]) {
      oosParts.push(formatFirm(firm));
      oosParts.push('');
    }

    oosText = oosParts.join('\n');
  }

  return { utah: utahText, outOfState: oosText };
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
      return NextResponse.json({ utah, outOfState });
    }

    // Default: return Utah file as downloadable text
    const filename = `${surveyYear}_ArchRankings.txt`;
    return new NextResponse(utah, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
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
