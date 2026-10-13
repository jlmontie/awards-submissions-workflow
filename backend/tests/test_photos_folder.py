"""
Who creates a submission's Photos folder.

A submission's photos upload together and the photo processor runs them in
parallel. It used to create Photos when it didn't find one, so several
photos would miss at once and each create a folder, splitting the photos
between two or three Photos folders. The PDF processor, which runs once per
submission, now creates it; the photo processor only looks it up.
"""

from datetime import datetime, timedelta, timezone
from unittest import mock

import pytest
from cloudevents.http import CloudEvent
from werkzeug.exceptions import TooManyRequests

from conftest import pdf_processor, photo_processor


class Stop(Exception):
    """Ends process_pdf once the folders are made; the rest is not under test."""


def make_event(path: str, age: timedelta) -> CloudEvent:
    created = (datetime.now(timezone.utc) - age).isoformat().replace('+00:00', 'Z')
    return CloudEvent(
        {'type': 'google.cloud.storage.object.v1.finalized', 'source': 'test'},
        {'bucket': 'bucket', 'name': path, 'timeCreated': created},
    )


def test_pdf_processor_creates_photos_folder():
    folders = {'2026': 'year-1', 'Lehi Civic Center': 'project-1', 'Photos': 'photos-1'}
    find_or_create = mock.Mock(side_effect=lambda svc, parent, name, *a: folders[name])
    event = make_event('submissions/2026/abc-123/pdf/form.pdf', timedelta(0))

    with mock.patch.object(pdf_processor, 'storage_client') as storage, \
         mock.patch.object(pdf_processor, 'extract_pdf_fields',
                           return_value={'Official Name': 'Lehi Civic Center'}), \
         mock.patch.object(pdf_processor, 'get_secret', return_value='id'), \
         mock.patch.object(pdf_processor, 'get_sheets_service'), \
         mock.patch.object(pdf_processor, 'submission_already_recorded', return_value=False), \
         mock.patch.object(pdf_processor, 'get_drive_service', return_value='drive'), \
         mock.patch.object(pdf_processor, 'find_or_create_folder', find_or_create), \
         mock.patch.object(pdf_processor, 'upload_to_drive', side_effect=Stop):
        storage.bucket.return_value.blob.return_value.size = 1024
        with pytest.raises(Stop):
            pdf_processor.process_pdf(event)

    find_or_create.assert_any_call('drive', 'project-1', 'Photos')


def run_photo(age: timedelta, project_folder, photos_folder):
    event = make_event('submissions/2026/abc-123/photos/1.jpg', age)
    upload = mock.Mock(return_value='file-1')

    with mock.patch.object(photo_processor, 'storage_client') as storage, \
         mock.patch.object(photo_processor, 'process_image', return_value=(b'img', 'image/jpeg')), \
         mock.patch.object(photo_processor, 'get_secret', return_value='root-1'), \
         mock.patch.object(photo_processor, 'get_drive_service') as drive, \
         mock.patch.object(photo_processor, 'get_project_folder', return_value=project_folder), \
         mock.patch.object(photo_processor, 'find_folder_by_name', return_value=photos_folder), \
         mock.patch.object(photo_processor, 'upload_photo_to_drive', upload):
        storage.bucket.return_value.blob.return_value.size = 1024
        try:
            return photo_processor.process_photo.__wrapped__(event)
        finally:
            # Whatever happened, the photo processor must never make a folder.
            drive.return_value.files.return_value.create.assert_not_called()
            run_photo.upload = upload


def test_photo_uploads_into_existing_photos_folder():
    result = run_photo(timedelta(seconds=5), 'project-1', 'photos-1')
    assert result['status'] == 'success'
    assert run_photo.upload.call_args.args[3] == 'photos-1'


@pytest.mark.parametrize('project_folder, photos_folder', [
    (None, None),          # PDF processor hasn't reached Drive yet
    ('project-1', None),   # it has made the project folder but not Photos
])
def test_photo_retries_quietly_while_pdf_is_in_flight(project_folder, photos_folder):
    with pytest.raises(TooManyRequests):
        run_photo(timedelta(seconds=5), project_folder, photos_folder)
    run_photo.upload.assert_not_called()


def test_photo_errors_once_grace_window_has_passed():
    age = timedelta(seconds=photo_processor.FOLDER_GRACE_SECONDS + 1)
    with pytest.raises(photo_processor.FolderNotReady):
        run_photo(age, 'project-1', None)
    run_photo.upload.assert_not_called()
