"""
Each award year's entries go to their own spreadsheet, created when the year
is added. Years from before that have no Sheet ID and stay in the master.
"""

from datetime import timedelta
from unittest import mock

import pytest
from googleapiclient.errors import HttpError

from conftest import pdf_processor
from test_photos_folder import make_event

MASTER = 'master'
SA = 'sheets@uc-and-d.iam.gserviceaccount.com'


def http_error(status):
    return HttpError(mock.Mock(status=status, reason='x'), b'')


def tab_reader(rows=None, error=None):
    """A Sheets client whose spreadsheets().values().get().execute() gives the Award Years tab."""
    service = mock.MagicMock()
    execute = service.spreadsheets.return_value.values.return_value.get.return_value.execute
    if error:
        execute.side_effect = error
    else:
        execute.return_value = {'values': rows or []}
    return service


def test_lists_only_years_with_a_sheet():
    rows = [
        ['Year', 'Status', 'Opens', 'Closes', 'Closed At', 'Updated At', 'Updated By', 'Sheet ID'],
        ['2026', 'closed'],
        ['2027', 'open', '', '', '', '', '', ' sheet-2027 '],
    ]
    assert pdf_processor.award_year_sheets(tab_reader(rows), MASTER) == {'2027': 'sheet-2027'}


def test_finds_columns_by_heading():
    rows = [['Sheet ID', 'Year'], ['sheet-2027', '2027']]
    assert pdf_processor.award_year_sheets(tab_reader(rows), MASTER) == {'2027': 'sheet-2027'}


@pytest.mark.parametrize('rows', [[], [['Year', 'Status']]])
def test_a_tab_without_sheet_ids_means_the_master(rows):
    assert pdf_processor.award_year_sheets(tab_reader(rows), MASTER) == {}


def test_a_missing_tab_means_the_master():
    assert pdf_processor.award_year_sheets(tab_reader(error=http_error(400)), MASTER) == {}


def test_other_failures_raise_so_the_trigger_retries():
    # Falling back here would file the entry in the wrong spreadsheet.
    with pytest.raises(HttpError):
        pdf_processor.award_year_sheets(tab_reader(error=http_error(503)), MASTER)


class FakeSpreadsheet:
    """The tabs of the source and the new spreadsheet, for apply_sheet_layout."""

    def __init__(self, source_tabs=None, new_tabs=None):
        self.service = mock.MagicMock()
        self.requests = None
        self.source_tabs = source_tabs or [{'properties': {'sheetId': 7, 'title': 'Sheet1'}}]
        self.new_tabs = new_tabs or [
            {'properties': {'sheetId': 0}},
            {'properties': {'sheetId': 55}, 'filterViews': [{'filterViewId': 1}, {'filterViewId': 2}]},
        ]
        spreadsheets = self.service.spreadsheets.return_value
        spreadsheets.get.side_effect = self.get
        spreadsheets.sheets.return_value.copyTo.return_value.execute.return_value = {'sheetId': 55}
        spreadsheets.batchUpdate.side_effect = self.batch_update

    def get(self, spreadsheetId, fields):
        result = mock.Mock()
        tabs = self.source_tabs if spreadsheetId == 'source' else self.new_tabs
        result.execute.return_value = {'sheets': tabs}
        return result

    def batch_update(self, spreadsheetId, body):
        self.requests = body['requests']
        return mock.Mock()


def test_layout_is_one_atomic_step_that_clears_the_source_entries():
    fake = FakeSpreadsheet()
    pdf_processor.apply_sheet_layout(fake.service, 'new', 'source')

    copy = fake.service.spreadsheets.return_value.sheets.return_value.copyTo
    copy.assert_called_once_with(
        spreadsheetId='source', sheetId=7, body={'destinationSpreadsheetId': 'new'})
    assert fake.requests == [
        {'updateCells': {'range': {'sheetId': 55, 'startRowIndex': 1}, 'fields': 'userEnteredValue,note'}},
        {'deleteSheet': {'sheetId': 0}},
        {'deleteFilterView': {'filterId': 1}},
        {'deleteFilterView': {'filterId': 2}},
        {'updateSheetProperties': {'properties': {'sheetId': 55, 'title': 'Sheet1'}, 'fields': 'title'}},
    ]


def test_layout_needs_a_source_tab():
    fake = FakeSpreadsheet(source_tabs=[{'properties': {'sheetId': 7, 'title': 'Award Years'}}])
    with pytest.raises(ValueError, match='No Sheet1 tab'):
        pdf_processor.apply_sheet_layout(fake.service, 'new', 'source')


@pytest.fixture
def steps():
    with mock.patch.object(pdf_processor, 'find_or_create_folder', return_value='folder') as folder, \
         mock.patch.object(pdf_processor, 'find_year_sheet') as find, \
         mock.patch.object(pdf_processor, 'read_sheet_headers') as headers, \
         mock.patch.object(pdf_processor, 'apply_sheet_layout') as layout:
        yield mock.Mock(folder=folder, find=find, headers=headers, layout=layout)


def ensure(drive):
    return pdf_processor.ensure_year_sheet(drive, mock.sentinel.sheets, 'root', '2027', 'source', SA)


def test_creates_the_sheet_in_the_years_folder_and_shares_it(steps):
    steps.find.return_value = None
    steps.headers.return_value = []
    drive = mock.MagicMock()
    drive.files.return_value.create.return_value.execute.return_value = {'id': 'new'}

    assert ensure(drive) == 'new'

    steps.folder.assert_called_once_with(drive, 'root', '2027')
    drive.files.return_value.create.assert_called_once_with(
        body={'name': '2027 Awards Submissions',
              'mimeType': 'application/vnd.google-apps.spreadsheet',
              'parents': ['folder']},
        fields='id',
    )
    steps.layout.assert_called_once_with(mock.sentinel.sheets, 'new', 'source')
    drive.permissions.return_value.create.assert_called_once_with(
        fileId='new',
        body={'type': 'user', 'role': 'reader', 'emailAddress': SA},
        sendNotificationEmail=False,
    )


def test_finishes_a_sheet_left_half_made_by_an_earlier_try(steps):
    steps.find.return_value = 'existing'
    steps.headers.return_value = []
    drive = mock.MagicMock()

    assert ensure(drive) == 'existing'

    drive.files.return_value.create.assert_not_called()
    steps.layout.assert_called_once_with(mock.sentinel.sheets, 'existing', 'source')


def test_leaves_a_finished_sheet_and_its_entries_alone(steps):
    steps.find.return_value = 'existing'
    steps.headers.return_value = ['Awards ID']
    drive = mock.MagicMock()

    assert ensure(drive) == 'existing'

    steps.layout.assert_not_called()


def request(body):
    return mock.Mock(get_json=mock.Mock(return_value=body))


@pytest.mark.parametrize('body, message', [
    ({'year': '27', 'share_with': SA}, 'year'),
    ({'year': '2027', 'share_with': 'someone@gmail.com'}, 'share_with'),
    ({'year': '2027'}, 'share_with'),
])
def test_refuses_bad_requests(body, message):
    response, status = pdf_processor.create_year_sheet(request(body))
    assert status == 400 and message in response['error']


@pytest.fixture
def services():
    with mock.patch.object(pdf_processor, 'get_drive_service'), \
         mock.patch.object(pdf_processor, 'get_sheets_service'), \
         mock.patch.object(pdf_processor, 'get_secret', side_effect=lambda name: f'secret:{name}'), \
         mock.patch.object(pdf_processor, 'ensure_year_sheet', return_value='new') as ensure_sheet:
        yield ensure_sheet


def test_answers_with_the_sheet_id(services):
    response, status = pdf_processor.create_year_sheet(
        request({'year': '2027', 'share_with': SA, 'source_sheet_id': 'sheet-2026'}))
    assert (response, status) == ({'sheet_id': 'new'}, 200)
    assert services.call_args.args[4] == 'sheet-2026'


def test_copies_the_master_when_there_is_no_earlier_year_sheet(services):
    pdf_processor.create_year_sheet(request({'year': '2027', 'share_with': SA}))
    assert services.call_args.args[4] == f'secret:{pdf_processor.AWARDS_SHEET_ID_SECRET}'


def test_reports_failures_to_the_portal(services):
    services.side_effect = RuntimeError('Drive is down')
    response, status = pdf_processor.create_year_sheet(request({'year': '2027', 'share_with': SA}))
    assert status == 500 and response == {'error': 'Drive is down'}


@pytest.mark.parametrize('year_sheets, expected', [
    ({'2027': 'sheet-2027'}, 'sheet-2027'),
    ({'2028': 'sheet-2028'}, MASTER),
    ({}, MASTER),
])
def test_a_submission_is_checked_numbered_and_written_in_its_years_sheet(year_sheets, expected):
    event = make_event('submissions/2027/sub-1/pdf/form.pdf', timedelta(0))
    with mock.patch.object(pdf_processor, 'storage_client') as storage, \
         mock.patch.object(pdf_processor, 'extract_pdf_fields', return_value={'Official Name': 'Wavetronix'}), \
         mock.patch.object(pdf_processor, 'drive_display_copy', side_effect=lambda pdf: pdf), \
         mock.patch.object(pdf_processor, 'read_contact_emails', return_value={'submitter': '', 'invoice': ''}), \
         mock.patch.object(pdf_processor, 'get_secret', return_value=MASTER), \
         mock.patch.object(pdf_processor, 'get_sheets_service'), \
         mock.patch.object(pdf_processor, 'award_year_sheets', return_value=year_sheets), \
         mock.patch.object(pdf_processor, 'submission_already_recorded', return_value=False) as recorded, \
         mock.patch.object(pdf_processor, 'get_drive_service', return_value='drive'), \
         mock.patch.object(pdf_processor, 'generate_awards_id', return_value='AW-2027-001') as generate, \
         mock.patch.object(pdf_processor, 'find_or_create_folder', return_value='folder'), \
         mock.patch.object(pdf_processor, 'find_or_create_project_folder', return_value='project'), \
         mock.patch.object(pdf_processor, 'upload_to_drive', return_value=('file', 'link')), \
         mock.patch.object(pdf_processor, 'append_row_by_header') as append, \
         mock.patch.object(pdf_processor, 'send_confirmation_email'):
        storage.bucket.return_value.blob.return_value.size = 1024
        pdf_processor.process_pdf(event)

    assert recorded.call_args.args[1] == expected
    assert generate.call_args.args[1] == expected
    assert append.call_args.args[1] == expected
