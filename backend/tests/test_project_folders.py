"""
Each submission gets its own Drive folder, found by its submissionId stamp.

Project folders used to be found by name and re-stamped. In 2026 two firms
entered "Nusano": the second entry reused the first's folder and replaced
its stamp, so the two submissions shared a folder and the first could no
longer be found by id.
"""

from unittest import mock

import pytest

from conftest import pdf_processor
from test_photos_folder import Stop, make_event


class FakeDrive:
    """Folders under one year folder, queried the way the processor queries them."""

    def __init__(self, folders):
        self.folders = folders  # [{'id', 'name', 'stamp'}]
        self.created, self.renamed = [], []

    def files(self):
        return self

    def list(self, q, **kwargs):
        hits = [f for f in self.folders if f"value='{f['stamp']}'" in q]
        self._result = {'files': [{'id': f['id'], 'name': f['name']} for f in hits]}
        return self

    def create(self, body, **kwargs):
        folder = {'id': f"new-{len(self.created) + 1}", 'name': body['name'],
                  'stamp': body.get('appProperties', {}).get('submissionId')}
        self.created.append(folder)
        self.folders.append(folder)
        self._result = {'id': folder['id']}
        return self

    def update(self, fileId, body, **kwargs):
        self.renamed.append((fileId, body['name']))
        self._result = {}
        return self

    def execute(self):
        return self._result


def test_name_is_project_first_then_awards_id():
    assert pdf_processor.project_folder_name('Nusano', 'AW-2026-041') == 'Nusano \u2014 AW-2026-041'


def test_a_second_entry_with_the_same_project_name_gets_its_own_folder():
    drive = FakeDrive([{'id': 'f1', 'name': 'Nusano \u2014 AW-2026-041', 'stamp': 'sub-a'}])
    folder = pdf_processor.find_or_create_project_folder(drive, 'year-1', 'sub-b', 'Nusano \u2014 AW-2026-058')
    assert folder == 'new-1'
    assert drive.created == [{'id': 'new-1', 'name': 'Nusano \u2014 AW-2026-058', 'stamp': 'sub-b'}]
    # The first entry's folder keeps its stamp.
    assert drive.folders[0]['stamp'] == 'sub-a'


def test_a_retry_finds_its_folder_by_stamp_and_fixes_the_label():
    drive = FakeDrive([{'id': 'f1', 'name': 'Nusano \u2014 AW-2026-041', 'stamp': 'sub-a'}])
    folder = pdf_processor.find_or_create_project_folder(drive, 'year-1', 'sub-a', 'Nusano \u2014 AW-2026-042')
    assert folder == 'f1'
    assert drive.created == []
    assert drive.renamed == [('f1', 'Nusano \u2014 AW-2026-042')]


def test_a_retry_with_the_same_label_changes_nothing():
    drive = FakeDrive([{'id': 'f1', 'name': 'Nusano \u2014 AW-2026-041', 'stamp': 'sub-a'}])
    assert pdf_processor.find_or_create_project_folder(drive, 'year-1', 'sub-a', 'Nusano \u2014 AW-2026-041') == 'f1'
    assert drive.created == [] and drive.renamed == []


def test_process_pdf_names_the_folder_with_the_awards_id():
    event = make_event('submissions/2026/sub-b/pdf/form.pdf', __import__('datetime').timedelta(0))
    project_folder = mock.Mock(return_value='project-1')
    with mock.patch.object(pdf_processor, 'storage_client') as storage, \
         mock.patch.object(pdf_processor, 'extract_pdf_fields', return_value={'Official Name': 'Nusano'}), \
         mock.patch.object(pdf_processor, 'get_secret', return_value='id'), \
         mock.patch.object(pdf_processor, 'get_sheets_service'), \
         mock.patch.object(pdf_processor, 'submission_already_recorded', return_value=False), \
         mock.patch.object(pdf_processor, 'get_drive_service', return_value='drive'), \
         mock.patch.object(pdf_processor, 'generate_awards_id', return_value='AW-2026-058'), \
         mock.patch.object(pdf_processor, 'find_or_create_folder', return_value='year-or-photos'), \
         mock.patch.object(pdf_processor, 'find_or_create_project_folder', project_folder), \
         mock.patch.object(pdf_processor, 'upload_to_drive', side_effect=Stop):
        storage.bucket.return_value.blob.return_value.size = 1024
        with pytest.raises(Stop):
            pdf_processor.process_pdf(event)
    project_folder.assert_called_once_with('drive', 'year-or-photos', 'sub-b', 'Nusano \u2014 AW-2026-058')
