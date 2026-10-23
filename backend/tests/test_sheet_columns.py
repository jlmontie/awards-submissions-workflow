"""
Rows are written under their headings, wherever those columns are.

The client edits the awards sheet by hand and wants the year as its first
column. Rows used to be written by position, so inserting or moving a column
would have put every later submission's values under the wrong headings, and
the duplicate check read column B regardless of what was there.
"""

import re

import pytest

from conftest import pdf_processor

LIVE_2026 = ['Submission Timestamp', 'Submission ID', 'PDF Link', 'Official Name', 'Awards ID',
             'Status', 'Winner Category', 'Winner Notes']


class FakeSheet:
    """Sheet1 as a grid: the heading row, data rows, and a column count."""

    def __init__(self, headers, rows=(), columns=None):
        self.grid = [list(headers)] + [list(r) for r in rows]
        self.columns = columns if columns is not None else len(headers)
        self.calls = []

    # The client surface the processor uses: spreadsheets().values().get(...).execute()
    def spreadsheets(self):
        return self

    def values(self):
        return self

    def get(self, spreadsheetId, range=None, fields=None):
        if fields is not None:  # spreadsheets().get(...)
            self._result = {'sheets': [{'properties': {
                'sheetId': 0, 'title': 'Sheet1', 'gridProperties': {'columnCount': self.columns}}}]}
        elif range == 'Sheet1!1:1':
            self._result = {'values': [self.grid[0]]}
        else:
            col = re.fullmatch(r'Sheet1!([A-Z]+):\1', range).group(1)
            index = column_index(col)
            self._result = {'values': [[r[index]] if len(r) > index else [] for r in self.grid]}
        return self

    def batchUpdate(self, spreadsheetId, body):
        self.columns += body['requests'][0]['appendDimension']['length']
        self.calls.append('widen')
        self._result = {}
        return self

    def update(self, spreadsheetId, range, valueInputOption, body):
        first = column_index(re.match(r'Sheet1!([A-Z]+)1', range).group(1))
        assert first + len(body['values'][0]) <= self.columns, 'wrote past the grid'
        header = self.grid[0] + [''] * (first - len(self.grid[0]))
        self.grid[0] = header[:first] + body['values'][0]
        self._result = {}
        return self

    def append(self, spreadsheetId, range, valueInputOption, insertDataOption, body):
        assert range == 'Sheet1!A1'
        row = body['values'][0]
        assert len(row) <= self.columns, 'wrote past the grid'
        self.grid.append(row)
        self._result = {'updates': {}}
        return self

    def execute(self):
        return self._result

    def last_row(self):
        return dict(zip(self.grid[0], self.grid[-1]))


def column_index(letters):
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n - 1


ROW = {'Submission Timestamp': 't', 'Submission ID': 'sub-1', 'PDF Link': 'link', 'Official Name': 'Nusano',
       'Awards ID': 'AW-2027-001', 'Status': 'pending', 'Winner Category': '', 'Winner Notes': '',
       'Submitter Email': 's@x.co', 'Invoice Email': 'ap@x.co', 'Award Year': '2027'}


@pytest.mark.parametrize('index, letters', [(0, 'A'), (25, 'Z'), (26, 'AA'), (59, 'BH'), (60, 'BI'), (61, 'BJ')])
def test_column_letters(index, letters):
    assert pdf_processor._column_letter(index) == letters


def test_values_land_under_their_headings_after_the_client_rearranges():
    # Award Year inserted as column A, Status moved before Official Name, and
    # a column of the client's own that the processor knows nothing about.
    sheet = FakeSheet(['Award Year', 'Submission Timestamp', 'Submission ID', 'PDF Link', 'Status',
                       'Official Name', 'Judge Notes', 'Awards ID', 'Winner Category', 'Winner Notes',
                       'Submitter Email', 'Invoice Email'])
    pdf_processor.append_row_by_header(sheet, 'sheet-1', ROW)
    assert sheet.last_row() == {**ROW, 'Judge Notes': ''}
    assert sheet.grid[-1][0] == '2027'
    assert 'widen' not in sheet.calls


def test_headings_the_sheet_lacks_are_added_at_the_end():
    # The 2026 sheet: exactly as wide as its headings, none of the new ones.
    sheet = FakeSheet(LIVE_2026, rows=[['t0', 'sub-0', 'l', 'Old', 'AW-2026-001', 'pending', '', '']])
    pdf_processor.append_row_by_header(sheet, 'sheet-1', ROW)
    assert sheet.grid[0] == LIVE_2026 + ['Submitter Email', 'Invoice Email', 'Award Year']
    assert sheet.calls == ['widen'] and sheet.columns == 11
    assert sheet.last_row() == ROW
    # Existing rows are untouched.
    assert sheet.grid[1] == ['t0', 'sub-0', 'l', 'Old', 'AW-2026-001', 'pending', '', '']


def test_headings_match_ignoring_case_and_spaces():
    sheet = FakeSheet([' award year ', 'SUBMISSION ID'])
    pdf_processor.append_row_by_header(sheet, 'sheet-1', {'Award Year': '2027', 'Submission ID': 'sub-1'})
    assert sheet.grid[-1] == ['2027', 'sub-1']


def test_duplicate_check_finds_the_submission_id_column_wherever_it_is():
    sheet = FakeSheet(['Award Year', 'Submission Timestamp', 'Submission ID'],
                      rows=[['2026', 't', 'sub-1']])
    assert pdf_processor.submission_already_recorded(sheet, 'sheet-1', 'sub-1')
    assert not pdf_processor.submission_already_recorded(sheet, 'sheet-1', 'sub-2')
    # Column B is now Submission Timestamp; matching on it would be wrong.
    assert not pdf_processor.submission_already_recorded(sheet, 'sheet-1', 't')


def test_duplicate_check_without_the_heading_does_not_block():
    sheet = FakeSheet(['Something Else'], rows=[['sub-1']])
    assert pdf_processor.submission_already_recorded(sheet, 'sheet-1', 'sub-1') is False
