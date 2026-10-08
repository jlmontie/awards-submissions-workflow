#!/usr/bin/env python3
"""
Replay awards submissions that uploaded to GCS but never reached Drive or
the Sheet.

Between 2026-09-29 and 2026-10-07 the Drive OAuth refresh token was rejected
(`invalid_grant`), so `process_pdf` raised on its first Drive call — before
the folder, the sheet row and the confirmation email. The uploads themselves
succeeded, so every file is still in GCS and the submissions are recoverable.

Why a script rather than re-uploading to re-fire the GCS event:

  `photo-processor/main.py: get_project_folder()` does not match on
  submission_id. It lists the project folders under the year and returns
  `folders[0]`. With one project in the year that worked by luck; with
  several, replayed photos land in an arbitrary project's folder. This script
  takes the folder id that `process_pdf` returns and uploads that
  submission's photos straight into it, so the event path's bug cannot
  misfile anything.

The PDF side calls the real `process_pdf` with a synthetic CloudEvent, so the
row schema, Awards ID generation and folder naming stay in one place and
cannot drift from production.

Usage:

    # See what would happen (default -- writes nothing)
    python scripts/backfill-submissions.py

    # Recover Drive + Sheets, no emails to submitters
    python scripts/backfill-submissions.py --apply

    # Also send the confirmation emails
    python scripts/backfill-submissions.py --apply --send-emails

Credentials: uses your Application Default Credentials for GCS, Secret
Manager and Sheets discovery, and the stored user OAuth token (the same
secret the functions read) for Drive and Sheets writes. Authenticate with an
account that can read those secrets:

    gcloud auth application-default login
"""

import argparse
import importlib.util
import io
import os
import sys
import types
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Mirrors the deployed pdf-processor's environment. Override any of these by
# exporting them before running; the defaults are what the function has.
ENV_DEFAULTS = {
    'GCP_PROJECT_ID': 'uc-and-d',
    'AWARDS_SHEET_ID_SECRET': 'ucd-production-awards-sheet-id',
    'DRIVE_FOLDER_SECRET': 'ucd-production-awards-drive-folder',
    'DRIVE_OWNER_EMAIL': 'jesse@veolaconsulting.com',
    'USER_OAUTH_TOKEN_SECRET': 'ucd-production-awards-user-oauth-token',
    'SUBMISSIONS_BUCKET': 'awards-production-submissions-c85b36b7',
    'MAX_PDF_SIZE_MB': '50',
    'SMTP_HOST': 'smtp.resend.com',
    'SMTP_PORT': '587',
    'SMTP_USER': 'resend',
    'SMTP_PASS_SECRET': 'resend-api-key',
    'SMTP_FROM': 'Ladd Marshall <lmarshall@utahcdmag.com>',
}

# Only submissions uploaded on or after this instant are candidates. The token
# broke somewhere between the last good upload (2026-09-04) and the first
# observed failure; anything earlier was processed under the old token and
# must not be touched.
WINDOW_START = datetime(2026, 9, 29, 0, 0, 0, tzinfo=timezone.utc)


def load_module(name: str, path: Path):
    """Import a Cloud Function's main.py under a unique module name.

    Both functions are called `main`, so they cannot be imported by plain
    name. `functions_framework` is stubbed because it is a deploy-time
    dependency and only supplies a decorator.
    """
    if 'functions_framework' not in sys.modules:
        stub = types.ModuleType('functions_framework')
        stub.cloud_event = lambda fn: fn
        sys.modules['functions_framework'] = stub

    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def submission_ids_in_sheet(pdf_processor) -> set:
    """Submission IDs already recorded, so a rerun cannot double-post.

    `process_pdf` is not idempotent: it uploads the PDF again, takes another
    Awards ID and appends another row. Guarding here is what makes this script
    safe to run twice.
    """
    sheets = pdf_processor.get_sheets_service()
    sheet_id = pdf_processor.get_secret(pdf_processor.AWARDS_SHEET_ID_SECRET)
    result = sheets.spreadsheets().values().get(
        spreadsheetId=sheet_id, range='Sheet1!B:B',
    ).execute()
    return {row[0].strip() for row in result.get('values', []) if row and row[0].strip()}


def find_stranded(storage_client, bucket_name: str, known_ids: set):
    """Submissions with a PDF in GCS uploaded after WINDOW_START and absent
    from the sheet. Returns them oldest first, so the Awards IDs this script
    generates follow the order the submissions actually arrived."""
    bucket = storage_client.bucket(bucket_name)
    submissions = {}

    for blob in storage_client.list_blobs(bucket, prefix='submissions/'):
        parts = blob.name.split('/')
        if len(parts) < 5:
            continue
        _, year, submission_id, kind, filename = parts[0], parts[1], parts[2], parts[3], '/'.join(parts[4:])
        entry = submissions.setdefault(
            submission_id,
            {'id': submission_id, 'year': year, 'pdf': None, 'photos': [], 'uploaded': None},
        )
        if kind == 'pdf' and filename.lower().endswith('.pdf'):
            entry['pdf'] = blob
            entry['uploaded'] = blob.time_created
        elif kind == 'photos':
            entry['photos'].append(blob)

    stranded = [
        s for s in submissions.values()
        if s['pdf'] is not None
        and s['uploaded'] is not None
        and s['uploaded'] >= WINDOW_START
        and s['id'] not in known_ids
    ]
    stranded.sort(key=lambda s: s['uploaded'])
    return stranded


def upload_photos(photo_processor, drive_service, folder_id: str, photo_blobs) -> int:
    """Upload a submission's photos into the folder its PDF created.

    Deliberately bypasses `photo_processor.get_project_folder`, which returns
    an arbitrary project folder. Everything else -- resizing, mime handling --
    is the function's own code.
    """
    uploaded = 0
    for blob in sorted(photo_blobs, key=lambda b: b.name):
        filename = blob.name.split('/')[-1]
        try:
            photo_bytes = blob.download_as_bytes()
            processed, mime_type = photo_processor.process_image(photo_bytes, filename)
            photo_processor.upload_photo_to_drive(
                drive_service, processed, filename, folder_id, mime_type,
            )
            uploaded += 1
        except Exception as exc:  # one bad photo must not strand the rest
            print(f"      ! photo failed: {filename}: {exc}")
    return uploaded


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true',
                        help='actually write to Drive and Sheets (default: dry run)')
    parser.add_argument('--send-emails', action='store_true',
                        help='also send confirmation emails to submitters')
    args = parser.parse_args()

    for key, value in ENV_DEFAULTS.items():
        os.environ.setdefault(key, value)

    pdf_processor = load_module('pdf_processor_main', REPO_ROOT / 'backend' / 'pdf-processor' / 'main.py')
    photo_processor = load_module('photo_processor_main', REPO_ROOT / 'backend' / 'photo-processor' / 'main.py')

    bucket_name = os.environ['SUBMISSIONS_BUCKET']

    # Confirmation emails are the one irreversible, outward-facing part, and
    # these submissions are days old. Off unless asked for.
    if not args.send_emails:
        def _suppressed(email_data):
            print(f"      (email suppressed: would have gone to {email_data.get('to')})")
            return True
        pdf_processor.send_confirmation_email = _suppressed

    print(f"Reading sheet to find already-recorded submissions ...")
    known_ids = submission_ids_in_sheet(pdf_processor)
    print(f"  {len(known_ids)} submission(s) already in the sheet\n")

    stranded = find_stranded(pdf_processor.storage_client, bucket_name, known_ids)
    if not stranded:
        print("Nothing to backfill.")
        return 0

    print(f"{len(stranded)} submission(s) to replay, oldest first:\n")
    for s in stranded:
        print(f"  {s['uploaded']:%Y-%m-%d %H:%M}  {s['id']}  "
              f"{s['pdf'].name.split('/')[-1]}  ({len(s['photos'])} photos)")

    if not args.apply:
        print("\nDry run. Nothing written. Re-run with --apply to perform the backfill.")
        return 0

    print(f"\n{'=' * 70}\nApplying\n{'=' * 70}")
    drive_service = pdf_processor.get_drive_service()
    succeeded, failed = [], []

    for s in stranded:
        print(f"\n  {s['id']}  ({s['pdf'].name.split('/')[-1]})")
        try:
            event = types.SimpleNamespace(data={'bucket': bucket_name, 'name': s['pdf'].name})
            result = pdf_processor.process_pdf(event)
            awards_id = result['awards_id']
            folder_id = result['drive_folder_id']
            print(f"      {awards_id}  folder {folder_id}")

            count = upload_photos(photo_processor, drive_service, folder_id, s['photos'])
            print(f"      {count}/{len(s['photos'])} photos uploaded")
            succeeded.append((s['id'], awards_id, count, len(s['photos'])))
        except Exception as exc:
            print(f"      FAILED: {exc}")
            failed.append((s['id'], str(exc)))

    print(f"\n{'=' * 70}")
    print(f"Backfilled {len(succeeded)} submission(s)")
    for sid, awards_id, got, want in succeeded:
        flag = '' if got == want else f'  <-- {want - got} photo(s) missing'
        print(f"  {awards_id}  {sid}  {got}/{want} photos{flag}")
    if failed:
        print(f"\n{len(failed)} FAILED -- safe to re-run, the sheet guard skips what landed:")
        for sid, err in failed:
            print(f"  {sid}: {err}")
    if not args.send_emails:
        print("\nNo confirmation emails were sent. Re-running with --send-emails would")
        print("double-post, since these submissions are now in the sheet; notify")
        print("submitters by hand, or clear the rows first.")
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
