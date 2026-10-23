"""
The submitter and invoicing emails from the web form, through the PDF
processor: read from meta/submission.json, written to the row, and used to
address the confirmation.
"""

import json
from datetime import timedelta
from unittest import mock

import pytest

from conftest import pdf_processor
from test_photos_folder import make_event


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
         mock.patch.object(pdf_processor, 'append_row_by_header') as append, \
         mock.patch.object(pdf_processor, 'send_confirmation_email') as send:
        storage.bucket.return_value.blob.return_value.size = 1024
        pdf_processor.process_pdf(event)
    return append.call_args.args[2], send.call_args.args[0] if send.called else None


def test_row_carries_both_addresses_and_the_award_year():
    row, _ = run_process_pdf({'submitter': 'james@aeurbia.com', 'invoice': 'ap@aeurbia.com'})
    assert row['Submitter Email'] == 'james@aeurbia.com'
    assert row['Invoice Email'] == 'ap@aeurbia.com'
    assert row['Award Year'] == '2027'
    assert row['Awards ID'] == 'AW-2027-001' and row['Status'] == 'pending'


def test_confirmation_goes_to_the_submitter_and_copies_the_contact():
    _, email = run_process_pdf({'submitter': 'james@aeurbia.com', 'invoice': 'ap@aeurbia.com'})
    assert email['to'] == 'james@aeurbia.com'
    assert email['cc'] == 'craig@childmasonry.com'
    assert email['body'].startswith('Hello,')


def test_no_copy_when_the_submitter_is_the_contact():
    _, email = run_process_pdf({'submitter': 'Craig@ChildMasonry.com', 'invoice': 'ap@x.com'})
    assert 'cc' not in email
    assert email['body'].startswith('Dear Craig Child,')


def test_older_submissions_still_confirm_to_the_contact():
    row, email = run_process_pdf({'submitter': '', 'invoice': ''})
    assert row['Submitter Email'] == row['Invoice Email'] == ''
    assert email['to'] == 'craig@childmasonry.com' and 'cc' not in email
