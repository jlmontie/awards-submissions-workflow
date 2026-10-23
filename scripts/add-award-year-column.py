#!/usr/bin/env python3
"""
Insert an "Award Year" column as column A of the awards sheet, fill it in for
existing rows, and add a filter view for each year.

The client reads and edits the sheet directly, and wants each year's entries
easy to pick out now that every year shares one sheet. The PDF processor
fills Award Year for new rows; this sets up the column and backfills it.

Run this only after the processor that writes rows by heading is deployed
(release/2027-prep). The processor before that wrote rows by position, and
inserting a column would put every later submission one column off.

Each row's year comes from its Awards ID (AW-YYYY-NNN), or else the year of
its Submission Timestamp. Values are written as plain text, the way the
processor writes them, so the "<year> entries" filter views match.

Usage:

    # See what would happen (default -- writes nothing)
    python scripts/add-award-year-column.py

    # Insert the column, fill it in, add the filter views
    python scripts/add-award-year-column.py --apply

Credentials: as for backfill-submissions.py -- Application Default
Credentials to read the secrets, and the stored user OAuth token for Sheets:

    gcloud auth application-default login
"""

import argparse
import collections
import importlib.util
import os
import re
import sys
import types
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_DEFAULTS = {
    'GCP_PROJECT_ID': 'uc-and-d',
    'AWARDS_SHEET_ID_SECRET': 'ucd-production-awards-sheet-id',
    'USER_OAUTH_TOKEN_SECRET': 'ucd-production-awards-user-oauth-token',
}
TAB = 'Sheet1'
HEADING = 'Award Year'


def load_pdf_processor():
    """Import pdf-processor/main.py for its credentials and sheet helpers."""
    if 'functions_framework' not in sys.modules:
        stub = types.ModuleType('functions_framework')
        stub.cloud_event = lambda fn: fn
        sys.modules['functions_framework'] = stub
    spec = importlib.util.spec_from_file_location(
        'pdf_processor_main', REPO_ROOT / 'backend' / 'pdf-processor' / 'main.py')
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def row_year(headers, row, find_column):
    def cell(name):
        i = find_column(headers, name)
        return str(row[i]).strip() if i is not None and i < len(row) else ''
    m = re.match(r'AW-(\d{4})-', cell('Awards ID')) or re.match(r'(\d{4})-', cell('Submission Timestamp'))
    return m.group(1) if m else ''


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--apply', action='store_true', help='make the changes (default: dry run)')
    args = parser.parse_args()

    for key, value in ENV_DEFAULTS.items():
        os.environ.setdefault(key, value)
    pdf = load_pdf_processor()
    sheets = pdf.get_sheets_service()
    sheet_id = pdf.get_secret(os.environ['AWARDS_SHEET_ID_SECRET'])

    values = sheets.spreadsheets().values().get(spreadsheetId=sheet_id, range=f'{TAB}!A:ZZ').execute().get('values', [])
    headers, rows = values[0], values[1:]
    meta = sheets.spreadsheets().get(
        spreadsheetId=sheet_id, fields='sheets(properties(sheetId,title),filterViews(title))').execute()
    tab = next(s for s in meta['sheets'] if s['properties']['title'] == TAB)
    existing_views = {v['title'] for v in tab.get('filterViews', [])}

    years = [row_year(headers, r, pdf.find_column) for r in rows]
    counts = collections.Counter(y or '(unknown)' for y in years)
    already = pdf.find_column(headers, HEADING)
    print(f"{TAB}: {len(headers)} columns, {len(rows)} rows; years: {dict(sorted(counts.items()))}")
    if already is not None:
        print(f"'{HEADING}' already exists as column {pdf._column_letter(already)}; not inserting it again.")
    else:
        print(f"Will insert '{HEADING}' as column A and fill rows 2-{len(rows) + 1}.")
    new_views = sorted({y for y in years if y} - {v.split(' ')[0] for v in existing_views})
    print(f"Filter views: existing {sorted(existing_views) or 'none'}; will add {[f'{y} entries' for y in new_views] or 'none'}.")

    if not args.apply:
        print("\nDry run. Nothing written. Re-run with --apply to make these changes.")
        return 0

    if already is None:
        sheets.spreadsheets().batchUpdate(spreadsheetId=sheet_id, body={'requests': [{
            'insertDimension': {
                'range': {'sheetId': tab['properties']['sheetId'], 'dimension': 'COLUMNS',
                          'startIndex': 0, 'endIndex': 1},
                'inheritFromBefore': False,
            }
        }]}).execute()
        sheets.spreadsheets().values().update(
            spreadsheetId=sheet_id, range=f'{TAB}!A1:A{len(rows) + 1}', valueInputOption='RAW',
            body={'values': [[HEADING]] + [[y] for y in years]},
        ).execute()
        print(f"Inserted '{HEADING}' as column A and filled {len(rows)} rows.")
        column = 0
    else:
        column = already

    for year in new_views:
        sheets.spreadsheets().batchUpdate(spreadsheetId=sheet_id, body={'requests': [{'addFilterView': {'filter': {
            'title': f'{year} entries',
            'range': {'sheetId': tab['properties']['sheetId']},
            'filterSpecs': [{'columnIndex': column, 'filterCriteria': {
                'condition': {'type': 'TEXT_EQ', 'values': [{'userEnteredValue': year}]}}}],
        }}}]}).execute()
        print(f"Added filter view '{year} entries'.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
