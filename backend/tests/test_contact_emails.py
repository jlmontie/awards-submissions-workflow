"""
The submitter and invoicing emails from the web form, through the PDF
processor: read from meta/submission.json, added as Sheet columns, and used
to address the confirmation.
"""

import json
from datetime import timedelta
from unittest import mock

import pytest

from conftest import pdf_processor
from test_photos_folder import make_event


@pytest.fixture(autouse=True)
def reset_header_check():
    pdf_processor._contact_headers_checked = False
    yield
    pdf_processor._contact_headers_checked = False


def test_reads_both_addresses_from_the_meta_file():
    with mock.patch.object(pdf_processor, 'storage_client') as storage:
        storage.bucket.return_value.blob.return_value.download_as_bytes.return_value = json.dumps(
            {'submitterEmail': ' james@aeurbia.com ', 'invoiceEmail': 'ap@aeurbia.com'}).encode()
        emails = pdf_processor.read_contact_emails('bucket', '2027', 'sub-1')
    storage.bucket.return_value.blob.assert_called_with('submissions/2027/sub-1/meta/submission.json')
    assert emails == {'submitter': 'james@aeurbia.com', 'invoice': 'ap@aeurbia.com'}


def test_blank_when_the_submission_has_no_meta_file():
    with mock.patch.object(pdf_processor, 'storage_client') as storage:
        storage.bucket.return_value.blob.return_value.download_as_bytes.side_effect = Exception('404')
        assert pdf_processor.read_contact_emails('bucket', '2026', 'old') == {'submitter': '', 'invoice': ''}


@pytest.mark.parametrize('index, letters', [(0, 'A'), (25, 'Z'), (26, 'AA'), (59, 'BH'), (60, 'BI'), (61, 'BJ')])
def test_column_letters(index, letters):
    assert pdf_processor._column_letter(index) == letters


def fake_sheets(column_count, headings):
    sheets = mock.MagicMock()
    sheets.spreadsheets().get().execute.return_value = {'sheets': [
        {'properties': {'sheetId': 7, 'title': 'Sheet1', 'gridProperties': {'columnCount': column_count}}}]}
    sheets.spreadsheets().values().get().execute.return_value = {'values': [headings]} if headings else {}
    sheets.reset_mock(return_value=False)
    return sheets


def test_widens_the_sheet_and_adds_the_headings():
    # Sheet1 is exactly 60 columns, ending at Winner Notes.
    sheets = fake_sheets(60, [])
    pdf_processor.ensure_contact_headers(sheets, 'sheet-1', 60)
    sheets.spreadsheets().batchUpdate.assert_called_once_with(spreadsheetId='sheet-1', body={'requests': [
        {'appendDimension': {'sheetId': 7, 'dimension': 'COLUMNS', 'length': 2}}]})
    sheets.spreadsheets().values().update.assert_called_once_with(
        spreadsheetId='sheet-1', range='Sheet1!BI1:BJ1', valueInputOption='RAW',
        body={'values': [['Submitter Email', 'Invoice Email']]})


def test_checks_once_and_leaves_existing_headings_alone():
    sheets = fake_sheets(62, ['Submitter Email', 'Invoice Email'])
    pdf_processor.ensure_contact_headers(sheets, 'sheet-1', 60)
    pdf_processor.ensure_contact_headers(sheets, 'sheet-1', 60)
    sheets.spreadsheets().batchUpdate.assert_not_called()
    sheets.spreadsheets().values().update.assert_not_called()
    assert sheets.spreadsheets().get.call_count == 1


def test_never_overwrites_someone_elses_headings():
    sheets = fake_sheets(62, ['Invoiced?', ''])
    pdf_processor.ensure_contact_headers(sheets, 'sheet-1', 60)
    sheets.spreadsheets().values().update.assert_not_called()


def run_process_pdf(contact, pdf_email='craig@childmasonry.com'):
    event = make_event('submissions/2027/sub-1/pdf/form.pdf', timedelta(0))
    fields = {'Official Name': 'Wavetronix', 'Contact Name': 'Craig Child', 'Email': pdf_email}
    with mock.patch.object(pdf_processor, 'storage_client') as storage, \
         mock.patch.object(pdf_processor, 'extract_pdf_fields', return_value=fields), \
         mock.patch.object(pdf_processor, 'read_contact_emails', return_value=contact), \
         mock.patch.object(pdf_processor, 'get_secret', return_value='id'), \
         mock.patch.object(pdf_processor, 'get_sheets_service'), \
         mock.patch.object(pdf_processor, 'submission_already_recorded', return_value=False), \
         mock.patch.object(pdf_processor, 'get_drive_service', return_value='drive'), \
         mock.patch.object(pdf_processor, 'generate_awards_id', return_value='AW-2027-001'), \
         mock.patch.object(pdf_processor, 'find_or_create_folder', return_value='folder'), \
         mock.patch.object(pdf_processor, 'find_or_create_project_folder', return_value='project'), \
         mock.patch.object(pdf_processor, 'upload_to_drive', return_value=('file', 'link')), \
         mock.patch.object(pdf_processor, 'ensure_contact_headers') as headers, \
         mock.patch.object(pdf_processor, 'append_to_sheet') as append, \
         mock.patch.object(pdf_processor, 'send_confirmation_email') as send:
        storage.bucket.return_value.blob.return_value.size = 1024
        pdf_processor.process_pdf(event)
    return headers, append.call_args.args[2], send.call_args.args[0] if send.called else None


def test_row_ends_with_both_addresses_after_the_review_columns():
    headers, row, _ = run_process_pdf({'submitter': 'james@aeurbia.com', 'invoice': 'ap@aeurbia.com'})
    assert row[-6:] == ['AW-2027-001', 'pending', '', '', 'james@aeurbia.com', 'ap@aeurbia.com']
    # Winner Notes is column 60 (index 59), so the new columns start at index 60.
    assert len(row) == 62
    headers.assert_called_once_with(mock.ANY, 'id', 60)


def test_confirmation_goes_to_the_submitter_and_copies_the_contact():
    _, _, email = run_process_pdf({'submitter': 'james@aeurbia.com', 'invoice': 'ap@aeurbia.com'})
    assert email['to'] == 'james@aeurbia.com'
    assert email['cc'] == 'craig@childmasonry.com'
    assert email['body'].startswith('Hello,')


def test_no_copy_when_the_submitter_is_the_contact():
    _, _, email = run_process_pdf({'submitter': 'Craig@ChildMasonry.com', 'invoice': 'ap@x.com'})
    assert 'cc' not in email
    assert email['body'].startswith('Dear Craig Child,')


def test_older_submissions_still_confirm_to_the_contact():
    _, row, email = run_process_pdf({'submitter': '', 'invoice': ''})
    assert row[-2:] == ['', '']
    assert email['to'] == 'craig@childmasonry.com' and 'cc' not in email
