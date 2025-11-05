"""
Local development version of the Cloud Function PDF processor.
Run this locally to test PDF extraction and Drive/Sheets integration.

Usage:
    python main_local.py path/to/test.pdf [--dry-run]
"""
import os
import sys
import json
import logging
import argparse
from datetime import datetime
from typing import Dict, Any, Optional
from pathlib import Path

# Set up environment before importing Google libraries
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = os.path.expanduser(
    '~/.config/gcloud/application_default_credentials.json'
)

from google.cloud import storage, secretmanager
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from google.auth import default
import PyPDF2
import io

# Setup logging with more detail for local dev
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Environment variables with local defaults
PROJECT_ID = os.environ.get('GCP_PROJECT_ID', 'utah-construction-and-design')
DRIVE_FOLDER_SECRET = os.environ.get('DRIVE_FOLDER_SECRET', 'awards-production-drive-folder')
SHEET_ID_SECRET = os.environ.get('SHEET_ID_SECRET', 'awards-production-sheet-id')
SUBMISSIONS_BUCKET = os.environ.get('SUBMISSIONS_BUCKET', 'awards-production-submissions-704c8c7f')
MAX_PDF_SIZE_MB = int(os.environ.get('MAX_PDF_SIZE_MB', 50))

# Local development flags
DRY_RUN = False
USE_REAL_DRIVE = True
USE_REAL_SHEETS = True


def get_credentials():
    """Get credentials for local development."""
    try:
        credentials, project = default(
            scopes=[
                'https://www.googleapis.com/auth/drive',
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/cloud-platform'
            ]
        )
        logger.info(f"Using credentials for project: {project}")
        return credentials
    except Exception as e:
        logger.error(f"Failed to get credentials: {e}")
        logger.info("Run: gcloud auth application-default login")
        sys.exit(1)


def get_secret(secret_id: str) -> str:
    """Retrieve a secret from Secret Manager."""
    try:
        secret_client = secretmanager.SecretManagerServiceClient()
        
        # Debug: log what we received
        logger.debug(f"get_secret() received: '{secret_id}'")
        logger.debug(f"  Type: {type(secret_id)}")
        logger.debug(f"  Starts with 'projects/': {secret_id.startswith('projects/')}")
        
        # Extract just the secret name from various possible formats:
        # 1. Just the name: "awards-production-drive-folder"
        # 2. Full path: "projects/PROJECT/secrets/NAME"
        # 3. Full path with version: "projects/PROJECT/secrets/NAME/versions/VERSION"
        
        if '/secrets/' in secret_id:
            # Extract the secret name from the path
            # projects/utah-construction-and-design/secrets/awards-production-drive-folder
            parts = secret_id.split('/secrets/')
            if len(parts) > 1:
                secret_name = parts[1].split('/')[0]  # Get just the name, ignore /versions/... if present
                logger.debug(f"Extracted secret name from path: '{secret_name}'")
            else:
                secret_name = secret_id
        else:
            # Already just a name
            secret_name = secret_id
            logger.debug(f"Using secret name as-is: '{secret_name}'")
        
        # Construct the full path
        name = f"projects/{PROJECT_ID}/secrets/{secret_name}/versions/latest"
        logger.debug(f"Final secret path: {name}")
        
        response = secret_client.access_secret_version(request={"name": name})
        secret_value = response.payload.data.decode('UTF-8')
        logger.info(f"✓ Retrieved secret: {secret_name}")
        return secret_value
    except Exception as e:
        logger.error(f"Error getting secret '{secret_id}': {e}")
        raise


def get_drive_service():
    """Get authenticated Google Drive service."""
    credentials = get_credentials()
    return build('drive', 'v3', credentials=credentials)


def get_sheets_service():
    """Get authenticated Google Sheets service."""
    credentials = get_credentials()
    return build('sheets', 'v4', credentials=credentials)


def extract_pdf_fields(pdf_bytes: bytes) -> Dict[str, Any]:
    """
    Extract form fields from a fillable PDF (AcroForm).
    
    Args:
        pdf_bytes: PDF file as bytes
        
    Returns:
        Dictionary of field names and values
    """
    try:
        pdf_file = io.BytesIO(pdf_bytes)
        reader = PyPDF2.PdfReader(pdf_file)
        
        fields = {}
        
        logger.info(f"PDF has {len(reader.pages)} pages")
        
        # Try to extract form fields
        if reader.get_fields():
            logger.info(f"Found {len(reader.get_fields())} form fields")
            for field_name, field_data in reader.get_fields().items():
                value = field_data.get('/V', '')
                if isinstance(value, bytes):
                    value = value.decode('utf-8', errors='ignore')
                fields[field_name] = str(value)
                logger.debug(f"  {field_name}: {value[:100] if value else '(empty)'}")
        else:
            logger.warning("No form fields found in PDF - may need OCR")
            # Return basic metadata
            fields['_pages'] = len(reader.pages)
            fields['_has_form_fields'] = False
            
        return fields
        
    except Exception as e:
        logger.error(f"Error extracting PDF fields: {e}")
        return {'_error': str(e)}


def create_drive_folder(service, parent_id: str, folder_name: str) -> str:
    """
    Create a folder in Google Drive.
    
    Args:
        service: Authenticated Drive service
        parent_id: Parent folder ID
        folder_name: Name for new folder
        
    Returns:
        ID of created folder
    """
    if DRY_RUN or not USE_REAL_DRIVE:
        logger.info(f"[DRY RUN] Would create folder: {folder_name} in parent {parent_id}")
        return f"fake-folder-id-{folder_name}"
    
    try:
        # First check if folder already exists
        query = f"name='{folder_name}' and mimeType='application/vnd.google-apps.folder' and '{parent_id}' in parents and trashed=false"
        results = service.files().list(q=query, spaces='drive', fields='files(id, name)').execute()
        existing = results.get('files', [])
        
        if existing:
            logger.info(f"Folder already exists: {folder_name} (ID: {existing[0]['id']})")
            return existing[0]['id']
        
        # Create new folder
        file_metadata = {
            'name': folder_name,
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': [parent_id]
        }
        
        folder = service.files().create(
            body=file_metadata,
            fields='id'
        ).execute()
        
        logger.info(f"Created folder: {folder_name} (ID: {folder.get('id')})")
        return folder.get('id')
    except Exception as e:
        logger.error(f"Error creating folder {folder_name}: {e}")
        raise


def upload_to_drive(service, file_bytes: bytes, filename: str, 
                   folder_id: str, mime_type: str = 'application/pdf') -> tuple:
    """
    Upload a file to Google Drive.
    
    Args:
        service: Authenticated Drive service
        file_bytes: File content as bytes
        filename: Name for the file
        folder_id: Parent folder ID
        mime_type: MIME type of file
        
    Returns:
        Tuple of (file_id, web_view_link)
    """
    if DRY_RUN or not USE_REAL_DRIVE:
        logger.info(f"[DRY RUN] Would upload: {filename} to folder {folder_id}")
        return ("fake-file-id", "https://drive.google.com/file/fake-file-id")
    
    try:
        file_metadata = {
            'name': filename,
            'parents': [folder_id]
        }
        
        media = MediaIoBaseUpload(
            io.BytesIO(file_bytes),
            mimetype=mime_type,
            resumable=True
        )
        
        file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id,webViewLink'
        ).execute()
        
        logger.info(f"Uploaded file: {filename} (ID: {file.get('id')})")
        logger.info(f"View at: {file.get('webViewLink')}")
        return file.get('id'), file.get('webViewLink')
    except Exception as e:
        logger.error(f"Error uploading file {filename}: {e}")
        raise


def append_to_sheet(service, sheet_id: str, values: list):
    """
    Append a row to Google Sheets.
    
    Args:
        service: Authenticated Sheets service
        sheet_id: Spreadsheet ID
        values: List of values to append
    """
    if DRY_RUN or not USE_REAL_SHEETS:
        logger.info(f"[DRY RUN] Would append to sheet {sheet_id}:")
        for i, val in enumerate(values):
            logger.info(f"  Column {i}: {val[:100] if isinstance(val, str) else val}")
        return
    
    try:
        body = {
            'values': [values]
        }
        
        result = service.spreadsheets().values().append(
            spreadsheetId=sheet_id,
            range='Sheet1!A:Z',
            valueInputOption='RAW',
            insertDataOption='INSERT_ROWS',
            body=body
        ).execute()
        
        logger.info(f"Appended row to sheet: {result.get('updates')}")
    except Exception as e:
        logger.error(f"Error appending to sheet: {e}")
        raise


def normalize_field_data(fields: Dict[str, Any]) -> Dict[str, str]:
    """
    Normalize extracted PDF fields into a consistent format.
    """
    normalized = {
        'submission_date': datetime.now().isoformat(),
        'project_name': fields.get('project_name', fields.get('Project Name', '')),
        'project_location': fields.get('project_location', fields.get('Location', '')),
        'project_cost': fields.get('project_cost', fields.get('Cost', '')),
        'completion_date': fields.get('completion_date', fields.get('Completion Date', '')),
        'company_name': fields.get('company', fields.get('Company', '')),
        'contact_name': fields.get('contact_name', fields.get('Contact', '')),
        'contact_email': fields.get('email', fields.get('Email', '')),
        'contact_phone': fields.get('phone', fields.get('Phone', '')),
    }
    
    # Add all other fields as JSON
    normalized['additional_fields'] = json.dumps(fields, indent=2)
    
    return normalized


def process_pdf_local(pdf_path: str, dry_run: bool = False):
    """
    Process a PDF file locally.
    
    Args:
        pdf_path: Path to PDF file
        dry_run: If True, don't actually upload to Drive/Sheets
    """
    global DRY_RUN
    DRY_RUN = dry_run
    
    logger.info(f"{'='*60}")
    logger.info(f"Processing PDF: {pdf_path}")
    logger.info(f"Dry run: {dry_run}")
    logger.info(f"{'='*60}")
    
    try:
        # Read PDF file
        pdf_file_path = Path(pdf_path)
        if not pdf_file_path.exists():
            logger.error(f"File not found: {pdf_path}")
            return
        
        pdf_bytes = pdf_file_path.read_bytes()
        file_size_mb = len(pdf_bytes) / (1024 * 1024)
        logger.info(f"PDF size: {file_size_mb:.2f} MB")
        
        if file_size_mb > MAX_PDF_SIZE_MB:
            logger.error(f"PDF too large: {file_size_mb:.2f} MB (max: {MAX_PDF_SIZE_MB} MB)")
            return
        
        # Extract form fields
        logger.info("\n--- EXTRACTING PDF FIELDS ---")
        fields = extract_pdf_fields(pdf_bytes)
        logger.info(f"Extracted {len(fields)} fields")
        
        # Display all fields
        logger.info("\n--- RAW FIELD DATA ---")
        for key, value in fields.items():
            logger.info(f"{key}: {value}")
        
        # Normalize data
        logger.info("\n--- NORMALIZED DATA ---")
        normalized_data = normalize_field_data(fields)
        for key, value in normalized_data.items():
            if key != 'additional_fields':
                logger.info(f"{key}: {value}")
        
        # Generate submission details
        project_name = normalized_data.get('project_name', 'Unnamed Project').strip()
        if not project_name:
            project_name = f"Test-Submission-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        
        submission_id = f"local-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        year = datetime.now().strftime('%Y')
        month = datetime.now().strftime('%m')
        filename = pdf_file_path.name
        
        logger.info(f"\nSubmission ID: {submission_id}")
        logger.info(f"Project name: {project_name}")
        
        # Get Drive root folder ID
        logger.info("\n--- ACCESSING DRIVE & SHEETS ---")
        drive_root_id = get_secret(DRIVE_FOLDER_SECRET)
        logger.info(f"Drive root folder ID: {drive_root_id}")
        
        sheet_id = get_secret(SHEET_ID_SECRET)
        logger.info(f"Sheet ID: {sheet_id}")
        
        if not dry_run:
            # Initialize services
            logger.info("\n--- CREATING DRIVE FOLDERS ---")
            drive_service = get_drive_service()
            
            # Create folder structure: Root > Year > Month > Project
            year_folder_id = create_drive_folder(drive_service, drive_root_id, year)
            month_folder_id = create_drive_folder(drive_service, year_folder_id, f"{year}-{month}")
            project_folder_id = create_drive_folder(drive_service, month_folder_id, project_name)
            
            logger.info(f"Project folder: https://drive.google.com/drive/folders/{project_folder_id}")
            
            # Upload PDF to Drive
            logger.info("\n--- UPLOADING PDF ---")
            file_id, file_link = upload_to_drive(
                drive_service,
                pdf_bytes,
                filename,
                project_folder_id
            )
            
            # Prepare row for Sheets
            logger.info("\n--- UPDATING SPREADSHEET ---")
            sheets_service = get_sheets_service()
            
            row_data = [
                normalized_data['submission_date'],
                submission_id,
                normalized_data['project_name'],
                normalized_data['project_location'],
                normalized_data['project_cost'],
                normalized_data['completion_date'],
                normalized_data['company_name'],
                normalized_data['contact_name'],
                normalized_data['contact_email'],
                normalized_data['contact_phone'],
                file_link,
                f"https://drive.google.com/drive/folders/{project_folder_id}",
                normalized_data['additional_fields']
            ]
            
            # Append to master sheet
            append_to_sheet(sheets_service, sheet_id, row_data)
            
            logger.info(f"\n{'='*60}")
            logger.info("✅ SUCCESS!")
            logger.info(f"{'='*60}")
            logger.info(f"Project folder: https://drive.google.com/drive/folders/{project_folder_id}")
            logger.info(f"PDF link: {file_link}")
            logger.info(f"Sheet: https://docs.google.com/spreadsheets/d/{sheet_id}")
        else:
            logger.info(f"\n{'='*60}")
            logger.info("✅ DRY RUN COMPLETE - No changes made")
            logger.info(f"{'='*60}")
        
    except Exception as e:
        logger.error(f"\n❌ ERROR: {e}", exc_info=True)
        raise


def main():
    """Main entry point for local testing."""
    parser = argparse.ArgumentParser(
        description='Local development tool for PDF processor Cloud Function'
    )
    parser.add_argument(
        'pdf_file',
        help='Path to PDF file to process'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Extract fields only, do not upload to Drive/Sheets'
    )
    parser.add_argument(
        '--project-id',
        default='utah-construction-and-design',
        help='GCP Project ID'
    )
    
    args = parser.parse_args()
    
    # Set project ID
    global PROJECT_ID
    PROJECT_ID = args.project_id
    os.environ['GCP_PROJECT_ID'] = PROJECT_ID

    # Process the PDF
    process_pdf_local(args.pdf_file, dry_run=args.dry_run)


if __name__ == '__main__':
    main()

