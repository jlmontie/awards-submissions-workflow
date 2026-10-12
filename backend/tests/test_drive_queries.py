"""
Drive query construction in the PDF and photo processors.

Both processors look folders up by name with a Drive `q` string. A project
name containing an apostrophe ("Davis County Sheriff's Office ...") used to be
interpolated raw, which made the query invalid and stranded the submission.

These tests live outside the processor directories so they are not packaged
into the function source zips.
"""

import importlib.util
import pathlib
import sys
from unittest import mock

import pytest

BACKEND = pathlib.Path(__file__).resolve().parent.parent


def load_processor(name: str):
    """Import a processor's main.py under a unique module name.

    Both processors create GCP clients at import time, which needs
    credentials; those are stubbed so the module can load in CI.
    """
    path = BACKEND / name / 'main.py'
    spec = importlib.util.spec_from_file_location(f'{name}_main', path)
    module = importlib.util.module_from_spec(spec)
    with mock.patch('google.cloud.storage.Client'), \
         mock.patch('google.cloud.secretmanager.SecretManagerServiceClient'):
        spec.loader.exec_module(module)
    sys.modules[spec.name] = module
    return module


pdf_processor = load_processor('pdf-processor')
photo_processor = load_processor('photo-processor')


class FakeDrive:
    """Records every `q` passed to files().list() and returns `files`."""

    def __init__(self, files=None):
        self.queries = []
        self._files = files or []

    def files(self):
        return self

    def list(self, q, **kwargs):
        self.queries.append(q)
        return self

    def update(self, **kwargs):
        return self

    def execute(self):
        return {'files': self._files}


@pytest.mark.parametrize('module', [pdf_processor, photo_processor])
@pytest.mark.parametrize('value, expected', [
    ('Lehi Civic Center', "'Lehi Civic Center'"),
    ("Davis County Sheriff's Office", "'Davis County Sheriff\\'s Office'"),
    ('back\\slash', "'back\\\\slash'"),
    ("trailing\\'", "'trailing\\\\\\''"),
])
def test_drive_query_literal(module, value, expected):
    assert module.drive_query_literal(value) == expected


def test_pdf_processor_escapes_project_name():
    drive = FakeDrive(files=[{'id': 'folder-1', 'name': 'x'}])
    pdf_processor.find_or_create_folder(
        drive, 'parent-1', "Davis County Sheriff's Office Emergency Operations Center"
    )
    assert drive.queries == [
        "name='Davis County Sheriff\\'s Office Emergency Operations Center' "
        "and mimeType='application/vnd.google-apps.folder' "
        "and 'parent-1' in parents and trashed=false"
    ]


def test_photo_processor_escapes_folder_name():
    drive = FakeDrive()
    photo_processor.find_folder_by_name(drive, 'parent-1', "O'Brien Hall")
    assert drive.queries == [
        "name='O\\'Brien Hall' "
        "and mimeType='application/vnd.google-apps.folder' "
        "and 'parent-1' in parents and trashed=false"
    ]


def test_photo_processor_submission_lookup_query():
    drive = FakeDrive(files=[{'id': 'year-1', 'name': '2026'}])
    photo_processor.get_project_folder(drive, 'root-1', '2026', 'abc-123')
    assert drive.queries[-1] == (
        "mimeType='application/vnd.google-apps.folder' "
        "and 'year-1' in parents and trashed=false "
        "and appProperties has { key='submissionId' and value='abc-123' }"
    )
