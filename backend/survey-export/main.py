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

import io
import os
import sys
import json
import logging
import zipfile
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
    'largest_project_completed', 'largest_project_completed_location',
    'largest_project_upcoming', 'largest_project_upcoming_location',
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


def join_project_and_location(project, location) -> str:
    """Combine a project name with its city into 'Project — City'."""
    p = str(project or '').strip()
    l = str(location or '').strip()
    if p and l:
        return f'{p} — {l}'
    return p or l or ''


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


def normalize_state(raw) -> str:
    # Free-text state field is sometimes entered as 'Utah' instead of 'UT'.
    # Normalize so Utah firms don't get misrouted to the out-of-state file.
    s = (str(raw or 'UT')).strip().upper()
    if not s or s == 'UTAH':
        return 'UT'
    return s


# ── RTF formatting ──────────────────────────────────────────────────
#
# The publication designer's InDesign workflow expects an .rtf with Courier
# 12pt + half-inch tab stops baked in, so columns render as an aligned grid
# in both TextEdit and Place File. This mirrors the TS export route — see
# frontend/src/app/api/surveys/admin/[id]/export/route.ts.
#
# At Courier 12pt, one tab stop (\deftab720, 720 twips) = ~5 characters.

RTF_TAB_CHARS = 5
ARCH_COLUMN_POSITIONS = [0, 25, 45, 55, 80, 145, 155, 165, 175, 185, 200]


def rtf_escape(s: str) -> str:
    out = []
    for ch in s:
        code = ord(ch)
        if ch == '\\':
            out.append('\\\\')
        elif ch == '{':
            out.append('\\{')
        elif ch == '}':
            out.append('\\}')
        elif code < 0x20:
            pass  # drop control chars
        elif code > 0x7F:
            out.append(f'\\u{code}?')
        else:
            out.append(ch)
    return ''.join(out)


def tabs_to_reach(current_pos: int, target_pos: int) -> Tuple[int, int]:
    """Return (tabs, new_pos) to advance from current to (or past) target.

    Tab stops every RTF_TAB_CHARS positions. Emits at least 1 tab so cells
    always have a separator, even when content overran its column.
    """
    pos = current_pos
    tabs = 0
    while pos < target_pos:
        pos = (pos // RTF_TAB_CHARS) * RTF_TAB_CHARS + RTF_TAB_CHARS
        tabs += 1
    if tabs == 0:
        pos = (current_pos // RTF_TAB_CHARS) * RTF_TAB_CHARS + RTF_TAB_CHARS
        tabs = 1
    return tabs, pos


def rtf_row(cells: List[str], positions: List[int]) -> str:
    pos = 0
    out = []
    for i, cell in enumerate(cells):
        if i > 0:
            target = positions[i] if i < len(positions) else pos + RTF_TAB_CHARS
            tabs, new_pos = tabs_to_reach(pos, target)
            out.append('\t' * tabs)
            pos = new_pos
        out.append(rtf_escape(cell))
        pos += len(cell)
    return ''.join(out)


def wrap_rtf(rows: List[str]) -> str:
    """Wrap RTF body rows in the document envelope (Courier + \\deftab720)."""
    header = '\n'.join([
        r'{\rtf1\ansi\ansicpg1252\cocoartf2578',
        r'\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fmodern\fcharset0 Courier;}',
        r'{\colortbl;\red255\green255\blue255;}',
        r'\margl1440\margr1440\vieww30920\viewh17560\viewkind0',
        r'\deftab720',
        r'\pard\pardeftab720\sl280\partightenfactor0',
        r'\f0\fs24 \cf0',
    ])
    body = '\n'.join(f'{r}\\' for r in rows)
    return f'{header}\n{body}\n}}\n'


def get_top_markets(firm: Dict, n: int = 3) -> List[Tuple[str, float]]:
    """Get top N market segments by percentage."""
    markets = []
    custom_other = str(firm.get('other_segment_name', '') or '').strip()
    for key, display_name in MARKET_DISPLAY_NAMES.items():
        pct = parse_float(firm.get(key, ''))
        if pct > 0:
            name = custom_other if key == 'pct_other' and custom_other else display_name
            markets.append((name, pct))
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

def header_cells(survey_year: int) -> List[List[str]]:
    """Header rows as 11-cell arrays so TXT and RTF can share the layout."""
    prev = survey_year - 1
    prev1 = survey_year - 2
    prev2 = survey_year - 3
    return [
        ['', '', '', '', '', '', 'Annual Revenues (millions)', '', '', '', ''],
        ['Firm Name', 'Phone', 'Year Est.', 'Top Executive',
         f'Largest Project to Finish in {prev}', '# Employees',
         str(prev), str(prev1), str(prev2), 'Top Markets', '%'],
        ['Address', 'Website', '', 'Title',
         f'Largest Project to Start in {survey_year}', '# Lic. Archs',
         '', '', '', '', ''],
        ['', '', '', 'Years at Firm', '', '# LEED AP', '', '', '', '', ''],
    ]


def build_header(survey_year: int) -> str:
    """Build the column header block (4 lines) as TXT."""
    return '\n'.join('\t'.join(row) for row in header_cells(survey_year))


def firm_cells(firm: Dict) -> List[List[str]]:
    """Three 11-cell rows for one firm, shared by both TXT and RTF formatters."""
    is_dnd = str(firm.get('revenue_dnd', '')).upper() == 'TRUE'

    rev_current = format_revenue(firm.get('revenue_current', ''), is_dnd)
    rev_prior_1 = format_revenue(firm.get('revenue_prior_1', ''), is_dnd)
    rev_prior_2 = format_revenue(firm.get('revenue_prior_2', ''), is_dnd)

    city = str(firm.get('city', '')).strip()
    state = normalize_state(firm.get('state', ''))
    zip_code = str(firm.get('zip', '')).strip()
    city_state_zip = f'{city}, {state} {zip_code}'

    top_markets = get_top_markets(firm)

    completed_project = join_project_and_location(
        firm.get('largest_project_completed', ''),
        firm.get('largest_project_completed_location', ''),
    )
    upcoming_project = join_project_and_location(
        firm.get('largest_project_upcoming', ''),
        firm.get('largest_project_upcoming_location', ''),
    )

    return [
        # Row 1: firm name, phone, year, exec, project completed,
        #         employees, rev x3, market 1
        [str(firm.get('firm_name', '')),
         str(firm.get('phone', '')),
         str(firm.get('year_founded', '')),
         str(firm.get('top_executive', '')),
         completed_project,
         str(firm.get('num_employees', '')),
         rev_current, rev_prior_1, rev_prior_2,
         top_markets[0][0], format_pct(top_markets[0][1])],
        # Row 2: address, website, '', title, project upcoming,
        #         licensed archs, '', '', '', market 2
        [str(firm.get('address', '')),
         str(firm.get('website', '')),
         '',
         str(firm.get('top_executive_title', '')),
         upcoming_project,
         str(firm.get('num_licensed_architects', '')),
         '', '', '',
         top_markets[1][0], format_pct(top_markets[1][1])],
        # Row 3: city/st/zip, '', '', years at firm, '', LEED AP,
        #         '', '', '', market 3
        [city_state_zip,
         '', '',
         str(firm.get('years_at_firm', '')),
         '',
         str(firm.get('num_leed_ap', '')),
         '', '', '',
         top_markets[2][0], format_pct(top_markets[2][1])],
    ]


def format_firm(firm: Dict) -> str:
    """Format a single firm as 3 tab-delimited lines (TXT)."""
    return '\n'.join('\t'.join(row) for row in firm_cells(firm))


def generate_export(
    responses: List[Dict], survey_year: int
) -> Tuple[Dict[str, str], Optional[Dict[str, str]]]:
    """Generate the Utah rankings file and optionally the out-of-state file.

    Returns ({'txt', 'rtf'} for Utah, {'txt', 'rtf'} for out-of-state or None).
    Walks the firm buckets once and emits both formats line-by-line so they
    stay structurally in sync.
    """
    # ── Categorize firms ──
    utah_revenue = []
    utah_dnd = []
    out_of_state = []

    for firm in responses:
        state = normalize_state(firm.get('state', ''))
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

    prev_year = survey_year - 1
    nth = ordinal(survey_year - 2012)

    # Parallel TXT and RTF buffers, populated in lockstep so the two
    # formats stay structurally identical.
    txt_lines: List[str] = []
    rtf_lines: List[str] = []

    def push_text(s: str) -> None:
        txt_lines.append(s)
        rtf_lines.append(rtf_escape(s))

    def push_blank() -> None:
        txt_lines.append('')
        rtf_lines.append('')

    def push_header() -> None:
        for row in header_cells(survey_year):
            txt_lines.append('\t'.join(row))
            rtf_lines.append(rtf_row(row, ARCH_COLUMN_POSITIONS))

    def push_firm(firm: Dict) -> None:
        for row in firm_cells(firm):
            txt_lines.append('\t'.join(row))
            rtf_lines.append(rtf_row(row, ARCH_COLUMN_POSITIONS))

    push_text(f'{survey_year} Top Utah Architectural Firm Rankings')
    push_blank()
    push_text(
        f'Utah Construction + Design is pleased to publish its {nth} annual '
        f'list of the Top Architectural Firms in Utah, based on revenues '
        f'generated in {prev_year} by a firm\u2019s Utah offices. Projects '
        f'outside of Utah that are billed to Utah-based offices are included. '
        f'Firms who chose not to disclose revenues (DND) are listed after '
        f'revenue-disclosing firms by number of employees.'
    )
    push_blank()
    push_header()
    push_blank()

    for firm in utah_revenue:
        push_firm(firm)
        push_blank()

    if utah_dnd:
        push_blank()
        push_text(
            'Firms that Did Not Disclose Revenues (listed by # of employees)'
        )
        push_blank()
        push_blank()
        for firm in utah_dnd:
            push_firm(firm)
            push_blank()

    utah = {'txt': '\n'.join(txt_lines), 'rtf': wrap_rtf(rtf_lines)}

    oos: Optional[Dict[str, str]] = None
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

        oos_txt: List[str] = []
        oos_rtf: List[str] = []

        def push_oos_text(s: str) -> None:
            oos_txt.append(s)
            oos_rtf.append(rtf_escape(s))

        def push_oos_blank() -> None:
            oos_txt.append('')
            oos_rtf.append('')

        def push_oos_header() -> None:
            for row in header_cells(survey_year):
                oos_txt.append('\t'.join(row))
                oos_rtf.append(rtf_row(row, ARCH_COLUMN_POSITIONS))

        def push_oos_firm(firm: Dict) -> None:
            for row in firm_cells(firm):
                oos_txt.append('\t'.join(row))
                oos_rtf.append(rtf_row(row, ARCH_COLUMN_POSITIONS))

        push_oos_text(
            f'{survey_year} Top Architectural Firm Rankings - Out of State'
        )
        push_oos_blank()
        push_oos_header()
        push_oos_blank()

        for firm in oos_revenue + oos_dnd:
            push_oos_firm(firm)
            push_oos_blank()

        oos = {'txt': '\n'.join(oos_txt), 'rtf': wrap_rtf(oos_rtf)}

    return utah, oos


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


def build_export_zip(
    survey_year: int,
    utah: Dict[str, str],
    oos: Optional[Dict[str, str]],
) -> bytes:
    """Bundle the .txt and .rtf outputs for one survey into a ZIP."""
    base = f'{survey_year}_ArchRankings'
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr(f'{base}.txt', utah['txt'])
        z.writestr(f'{base}.rtf', utah['rtf'])
        if oos:
            z.writestr(f'{base}_OutOfState.txt', oos['txt'])
            z.writestr(f'{base}_OutOfState.rtf', oos['rtf'])
    return buf.getvalue()


# ── Cloud Function entry point ──────────────────────────────────────

try:
    import functions_framework

    @functions_framework.http
    def export_survey(request):
        """HTTP Cloud Function entry point.

        Query params:
            survey_id (required): e.g. ARCH-2026
            format (optional): 'json' returns the TXT strings as JSON
                (for programmatic preview); otherwise returns a ZIP with
                both .txt and .rtf for each file (the designer's
                InDesign workflow consumes the .rtf).
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

        utah, oos = generate_export(responses, survey_year)

        if request.args.get('format') == 'json':
            result = {'utah': utah['txt']}
            if oos:
                result['out_of_state'] = oos['txt']
            return (
                json.dumps(result, ensure_ascii=False),
                200,
                {'Content-Type': 'application/json'},
            )

        zip_bytes = build_export_zip(survey_year, utah, oos)
        return (
            zip_bytes,
            200,
            {
                'Content-Type': 'application/zip',
                'Content-Disposition': (
                    f'attachment; filename="{survey_year}_ArchRankings.zip"'
                ),
            },
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

    utah, oos = generate_export(responses, survey_year)

    # Bundle .txt and .rtf for each output into a single .zip so the
    # designer's InDesign workflow gets the aligned-grid RTF while
    # downstream scripts keep the plain-tab TXT.
    zip_filename = f'{survey_year}_ArchRankings.zip'
    with open(zip_filename, 'wb') as f:
        f.write(build_export_zip(survey_year, utah, oos))
    print(f'Written: {zip_filename}')

    print(f'\nExport complete. {len(responses)} firms processed.')
