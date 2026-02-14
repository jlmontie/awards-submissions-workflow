"""
Survey Export: Generates tab-delimited text files from survey responses.

Reads completed survey responses from Google Sheets and produces
publication-ready tab-delimited text files matching the format used
by UC+D's graphic designer for InDesign layout.

Usage (local):
    export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
    export SURVEY_SHEET_ID=your_sheet_id
    python main.py [SURVEY_ID]

Usage (Cloud Function - HTTP trigger):
    GET ?survey_id=ARCH-2026
"""

import os
import sys
import json
import logging
from typing import Dict, List, Tuple, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Column definitions ──────────────────────────────────────────────
# Matches the order written by frontend/src/app/api/surveys/responses/route.ts
RESPONSE_COLUMNS = [
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
]

# Market segment display names (short names matching publication style)
MARKET_DISPLAY_NAMES = {
    'pct_k12': 'K-12',
    'pct_higher_ed': 'Higher Ed',
    'pct_civic': 'Civic/Inst.',
    'pct_healthcare': 'Healthcare',
    'pct_office': 'Office',
    'pct_resort_hospitality': 'Resort/Hosp.',
    'pct_multi_family': 'Multi-Family',
    'pct_commercial_retail': 'Comm/Retail',
    'pct_sports_rec': 'Sports/Rec',
    'pct_industrial': 'Industrial',
    'pct_other': 'Other',
}


# ── Helpers ─────────────────────────────────────────────────────────

def parse_float(value, default: float = 0.0) -> float:
    """Parse a string to float, stripping $ and commas."""
    if not value:
        return default
    try:
        return float(str(value).replace('$', '').replace(',', '').strip())
    except (ValueError, TypeError):
        return default


def parse_int(value, default: int = 0) -> int:
    """Parse a string to int."""
    if not value:
        return default
    try:
        return int(float(str(value).replace(',', '').strip()))
    except (ValueError, TypeError):
        return default


def ordinal(n: int) -> str:
    """Return ordinal string for a number (1st, 2nd, 3rd, etc.)."""
    if 11 <= (n % 100) <= 13:
        suffix = 'th'
    else:
        suffix = {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')
    return f'{n}{suffix}'


def format_revenue(value: str, is_dnd: bool = False) -> str:
    """Format a revenue value for publication.

    Revenue values are stored in millions (e.g., 47.5 means $47.5M).
    Returns formatted string like '$47.5' or 'DND'.
    """
    if is_dnd:
        return 'DND'
    if not value or str(value).strip().upper() == 'DND':
        return 'DND'
    v = parse_float(value)
    if v == 0:
        return 'DND'
    return f'${v:.1f}'


def format_pct(value) -> str:
    """Format a percentage for display (e.g., '35%')."""
    if isinstance(value, (int, float)) and value > 0:
        return f'{int(round(value))}%'
    return ''


def get_top_markets(firm: Dict, n: int = 3) -> List[Tuple[str, float]]:
    """Get top N market segments by percentage."""
    markets = []
    for key, display_name in MARKET_DISPLAY_NAMES.items():
        pct = parse_float(firm.get(key, ''))
        if pct > 0:
            markets.append((display_name, pct))
    markets.sort(key=lambda x: x[1], reverse=True)
    # Pad to n entries
    while len(markets) < n:
        markets.append(('', 0))
    return markets[:n]


def rows_to_dicts(rows: List[List[str]]) -> List[Dict]:
    """Convert sheet rows to list of dicts.

    If the first row looks like a header row (contains 'response_id'),
    use it for column names. Otherwise use positional RESPONSE_COLUMNS.
    """
    if not rows:
        return []

    first_row = rows[0]
    if first_row and str(first_row[0]).strip().lower() == 'response_id':
        headers = [str(h).strip().lower() for h in first_row]
        data_rows = rows[1:]
    else:
        headers = RESPONSE_COLUMNS
        data_rows = rows

    result = []
    for row in data_rows:
        d = {}
        for i, col in enumerate(headers):
            d[col] = row[i] if i < len(row) else ''
        result.append(d)
    return result


# ── Export formatting ───────────────────────────────────────────────

def build_header(survey_year: int) -> str:
    """Build the column header block (4 lines)."""
    prev = survey_year - 1
    prev1 = survey_year - 2
    prev2 = survey_year - 3

    lines = [
        # Supertitle aligned to revenue columns (after 6 data columns)
        '\t\t\t\t\t\tAnnual Revenues (millions)',
        # Column titles row 1
        (f'Firm Name\tPhone\tYear Est.\tTop Executive\t'
         f'Largest Project to Finish in {prev}\t'
         f'# Employees\t{prev}\t{prev1}\t{prev2}\tTop Markets\t%'),
        # Column titles row 2
        (f'Address\tWebsite\t\tTitle\t'
         f'Largest Project to Start in {survey_year}\t# Lic. Archs'),
        # Column titles row 3
        '\t\t\tYears at Firm\t\t# LEED AP',
    ]
    return '\n'.join(lines)


def format_firm(firm: Dict) -> str:
    """Format a single firm as 3 tab-delimited lines."""
    is_dnd = str(firm.get('revenue_dnd', '')).upper() == 'TRUE'

    # Revenue
    rev_current = format_revenue(firm.get('revenue_current', ''), is_dnd)
    rev_prior_1 = format_revenue(firm.get('revenue_prior_1', ''), is_dnd)
    rev_prior_2 = format_revenue(firm.get('revenue_prior_2', ''), is_dnd)

    # City, State ZIP
    city = str(firm.get('city', '')).strip()
    state = (str(firm.get('state', '')) or 'UT').strip().upper()
    if not state:
        state = 'UT'
    zip_code = str(firm.get('zip', '')).strip()
    city_state_zip = f'{city}, {state} {zip_code}'

    # Top 3 markets
    top_markets = get_top_markets(firm)

    # Build 3 rows
    lines = [
        # Row 1: firm name, phone, year, exec, project completed,
        #         employees, rev x3, market 1
        '\t'.join([
            str(firm.get('firm_name', '')),
            str(firm.get('phone', '')),
            str(firm.get('year_founded', '')),
            str(firm.get('top_executive', '')),
            str(firm.get('largest_project_completed', '')),
            str(firm.get('num_employees', '')),
            rev_current,
            rev_prior_1,
            rev_prior_2,
            top_markets[0][0],
            format_pct(top_markets[0][1]),
        ]),
        # Row 2: address, website, (blank), title, project upcoming,
        #         licensed archs, (blank x3), market 2
        '\t'.join([
            str(firm.get('address', '')),
            str(firm.get('website', '')),
            '',
            str(firm.get('top_executive_title', '')),
            str(firm.get('largest_project_upcoming', '')),
            str(firm.get('num_licensed_architects', '')),
            '',
            '',
            '',
            top_markets[1][0],
            format_pct(top_markets[1][1]),
        ]),
        # Row 3: city/st/zip, (blank x2), years at firm, (blank),
        #         LEED AP, (blank x3), market 3
        '\t'.join([
            city_state_zip,
            '',
            '',
            str(firm.get('years_at_firm', '')),
            '',
            str(firm.get('num_leed_ap', '')),
            '',
            '',
            '',
            top_markets[2][0],
            format_pct(top_markets[2][1]),
        ]),
    ]
    return '\n'.join(lines)


def generate_export(
    responses: List[Dict], survey_year: int
) -> Tuple[str, Optional[str]]:
    """Generate the Utah rankings file and optionally the out-of-state file.

    Returns (utah_text, out_of_state_text). out_of_state_text is None
    if there are no out-of-state firms.
    """
    # ── Categorize firms ──
    utah_revenue = []
    utah_dnd = []
    out_of_state = []

    for firm in responses:
        state = (str(firm.get('state', '')) or 'UT').strip().upper()
        if not state:
            state = 'UT'
        is_dnd = str(firm.get('revenue_dnd', '')).upper() == 'TRUE'

        if state != 'UT':
            out_of_state.append(firm)
        elif is_dnd:
            utah_dnd.append(firm)
        else:
            utah_revenue.append(firm)

    # ── Sort ──
    utah_revenue.sort(
        key=lambda x: parse_float(x.get('revenue_current', '0')),
        reverse=True,
    )
    utah_dnd.sort(
        key=lambda x: parse_int(x.get('num_employees', '0')),
        reverse=True,
    )

    # ── Build Utah file ──
    prev_year = survey_year - 1
    nth = ordinal(survey_year - 2012)

    parts = []
    parts.append(f'{survey_year} Top Utah Architectural Firm Rankings')
    parts.append('')
    parts.append(
        f'Utah Construction & Design is pleased to publish its {nth} annual '
        f'list of the Top Architectural Firms in Utah, based on revenues '
        f'generated in {prev_year} by a firm\u2019s Utah offices. Projects '
        f'outside of Utah that are billed to Utah-based offices are included. '
        f'Firms who chose not to disclose revenues (DND) are listed after '
        f'revenue-disclosing firms by number of employees.'
    )
    parts.append('')
    parts.append(build_header(survey_year))
    parts.append('')

    for firm in utah_revenue:
        parts.append(format_firm(firm))
        parts.append('')

    if utah_dnd:
        parts.append('')
        parts.append(
            'Firms that Did Not Disclose Revenues (listed by # of employees)'
        )
        parts.append('')
        parts.append('')
        for firm in utah_dnd:
            parts.append(format_firm(firm))
            parts.append('')

    utah_text = '\n'.join(parts)

    # ── Build out-of-state file ──
    oos_text = None
    if out_of_state:
        oos_revenue = [
            f for f in out_of_state
            if str(f.get('revenue_dnd', '')).upper() != 'TRUE'
        ]
        oos_dnd = [
            f for f in out_of_state
            if str(f.get('revenue_dnd', '')).upper() == 'TRUE'
        ]
        oos_revenue.sort(
            key=lambda x: parse_float(x.get('revenue_current', '0')),
            reverse=True,
        )
        oos_dnd.sort(
            key=lambda x: parse_int(x.get('num_employees', '0')),
            reverse=True,
        )

        parts = []
        parts.append(
            f'{survey_year} Top Architectural Firm Rankings - Out of State'
        )
        parts.append('')
        parts.append(build_header(survey_year))
        parts.append('')

        for firm in oos_revenue + oos_dnd:
            parts.append(format_firm(firm))
            parts.append('')

        oos_text = '\n'.join(parts)

    return utah_text, oos_text


# ── Google Sheets access ────────────────────────────────────────────

def get_sheets_client(credentials_path: str = None):
    """Get authenticated Google Sheets client."""
    if credentials_path:
        from google.oauth2 import service_account as sa
        creds = sa.Credentials.from_service_account_file(
            credentials_path,
            scopes=['https://www.googleapis.com/auth/spreadsheets.readonly'],
        )
    else:
        from google.auth import default
        creds, _ = default(
            scopes=['https://www.googleapis.com/auth/spreadsheets.readonly'],
        )

    from googleapiclient.discovery import build
    return build('sheets', 'v4', credentials=creds)


def read_survey_year(sheets, spreadsheet_id: str, survey_id: str) -> int:
    """Look up the survey year from the Surveys sheet."""
    result = sheets.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id,
        range='Surveys!A:G',
    ).execute()
    rows = result.get('values', [])

    for row in rows:
        if row and row[0] == survey_id:
            return int(row[3])  # year is column D (index 3)

    raise ValueError(f'Survey {survey_id} not found')


def read_responses(sheets, spreadsheet_id: str, survey_id: str) -> List[Dict]:
    """Read all responses for a given survey."""
    result = sheets.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id,
        range='Survey Responses!A:AZ',
    ).execute()
    rows = result.get('values', [])

    all_responses = rows_to_dicts(rows)

    # Filter to the requested survey
    return [r for r in all_responses if r.get('survey_id') == survey_id]


# ── Cloud Function entry point ──────────────────────────────────────

try:
    import functions_framework

    @functions_framework.http
    def export_survey(request):
        """HTTP Cloud Function entry point.

        Query params:
            survey_id (required): e.g. ARCH-2026
        Returns:
            JSON with 'utah' and optionally 'out_of_state' text fields.
        """
        survey_id = request.args.get('survey_id')
        if not survey_id:
            return ('Missing survey_id parameter', 400)

        spreadsheet_id = os.environ.get('SURVEY_SHEET_ID')
        if not spreadsheet_id:
            return ('SURVEY_SHEET_ID not configured', 500)

        sheets = get_sheets_client()
        survey_year = read_survey_year(sheets, spreadsheet_id, survey_id)
        responses = read_responses(sheets, spreadsheet_id, survey_id)

        if not responses:
            return (f'No responses found for survey {survey_id}', 404)

        utah_text, oos_text = generate_export(responses, survey_year)

        result = {'utah': utah_text}
        if oos_text:
            result['out_of_state'] = oos_text

        return (
            json.dumps(result, ensure_ascii=False),
            200,
            {'Content-Type': 'application/json'},
        )

except ImportError:
    pass  # functions_framework not installed (local dev)


# ── Local CLI entry point ───────────────────────────────────────────

if __name__ == '__main__':
    spreadsheet_id = os.environ.get('SURVEY_SHEET_ID')
    survey_id = sys.argv[1] if len(sys.argv) > 1 else 'ARCH-2026'
    credentials_path = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')

    if not spreadsheet_id:
        print('Set SURVEY_SHEET_ID environment variable')
        print('Usage: python main.py [SURVEY_ID]')
        sys.exit(1)

    sheets = get_sheets_client(credentials_path)
    survey_year = read_survey_year(sheets, spreadsheet_id, survey_id)
    responses = read_responses(sheets, spreadsheet_id, survey_id)

    logger.info(
        f'Found {len(responses)} responses for {survey_id} (year {survey_year})'
    )

    if not responses:
        print(f'No responses found for survey {survey_id}')
        sys.exit(0)

    utah_text, oos_text = generate_export(responses, survey_year)

    # Write output files
    utah_filename = f'{survey_year}_ArchRankings.txt'
    with open(utah_filename, 'w', encoding='utf-8') as f:
        f.write(utah_text)
    print(f'Written: {utah_filename}')

    if oos_text:
        oos_filename = f'{survey_year}_ArchRankings_OutOfState.txt'
        with open(oos_filename, 'w', encoding='utf-8') as f:
            f.write(oos_text)
        print(f'Written: {oos_filename}')

    print(f'\nExport complete. {len(responses)} firms processed.')
