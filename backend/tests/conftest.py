"""Loads the processors for the tests in this directory."""

import importlib.util
import pathlib
import sys
from unittest import mock

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
