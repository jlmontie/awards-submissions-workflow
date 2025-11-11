"""
Cloud Function to process uploaded PDF submissions.
Extracts form fields and creates organized folders in Google Drive.
"""
import os
import json
import logging
from datetime import datetime
from typing import Dict, Any, Optional
import functions_framework
from google.cloud import storage, secretmanager
from google.oauth2 import service_account
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
import PyPDF2
import io

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Environment variables
PROJECT_ID = os.environ.get('GCP_PROJECT_ID')
DRIVE_FOLDER_SECRET = os.environ.get('DRIVE_FOLDER_SECRET')
SHEET_ID_SECRET = os.environ.get('SHEET_ID_SECRET')
SUBMISSIONS_BUCKET = os.environ.get('SUBMISSIONS_BUCKET')
MAX_PDF_SIZE_MB = int(os.environ.get('MAX_PDF_SIZE_MB', 50))
DRIVE_OWNER_EMAIL = os.environ.get('DRIVE_OWNER_EMAIL')  # Email of Drive folder owner

# Initialize clients
storage_client = storage.Client()
secret_client = secretmanager.SecretManagerServiceClient()


def get_secret(secret_id: str) -> str:
    """Retrieve a secret from Secret Manager."""
    # Extract just the secret name from various possible formats:
    # 1. Just the name: "awards-production-drive-folder"
    # 2. Full path: "projects/PROJECT/secrets/NAME"
    # 3. Full path with version: "projects/PROJECT/secrets/NAME/versions/VERSION"
    
    if '/secrets/' in secret_id:
        # Extract the secret name from the path
        parts = secret_id.split('/secrets/')
        if len(parts) > 1:
            secret_name = parts[1].split('/')[0]  # Get just the name, ignore /versions/... if present
        else:
            secret_name = secret_id
    else:
        # Already just a name
        secret_name = secret_id
    
    # Construct the full path
    name = f"projects/{PROJECT_ID}/secrets/{secret_name}/versions/latest"
    
    response = secret_client.access_secret_version(request={"name": name})
    return response.payload.data.decode('UTF-8')


def get_user_credentials():
    """Get user OAuth credentials from Secret Manager."""
    secret_name = f"projects/{PROJECT_ID}/secrets/awards-production-user-oauth-token/versions/latest"
    response = secret_client.access_secret_version(request={"name": secret_name})
    token_data = json.loads(response.payload.data.decode('UTF-8'))

    # Create credentials from the user's OAuth token
    credentials = Credentials(
        token=None,  # Will be refreshed
        refresh_token=token_data['refresh_token'],
        token_uri='https://oauth2.googleapis.com/token',
        client_id=token_data['client_id'],
        client_secret=token_data['client_secret'],
        scopes=[
            'https://www.googleapis.com/auth/drive',
            'https://www.googleapis.com/auth/spreadsheets'
        ],
        quota_project_id=PROJECT_ID  # Set quota project for billing
    )

    logger.info(f"Using user OAuth credentials with quota project: {PROJECT_ID}")
    return credentials


def get_drive_service():
    """Get authenticated Google Drive service using user OAuth credentials."""
    credentials = get_user_credentials()
    return build('drive', 'v3', credentials=credentials)


def get_sheets_service():
    """Get authenticated Google Sheets service using user OAuth credentials."""
    credentials = get_user_credentials()
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
        
        # Try to extract form fields
        if reader.get_fields():
            for field_name, field_data in reader.get_fields().items():
                value = field_data.get('/V', '')
                if isinstance(value, bytes):
                    value = value.decode('utf-8', errors='ignore')
                fields[field_name] = str(value)
        else:
            logger.warning("No form fields found in PDF - may need OCR")
            # Return basic metadata
            fields['_pages'] = len(reader.pages)
            fields['_has_form_fields'] = False
            
        return fields
        
    except Exception as e:
        logger.error(f"Error extracting PDF fields: {e}")
        return {'_error': str(e)}


def find_or_create_folder(service, parent_id: str, folder_name: str) -> str:
    """
    Find existing folder or create new one in Google Drive.
    With impersonation, folders will be owned by the impersonated user.

    Args:
        service: Authenticated Drive service
        parent_id: Parent folder ID
        folder_name: Name for the folder

    Returns:
        ID of found or created folder
    """
    # First, try to find existing folder
    query = f"name='{folder_name}' and mimeType='application/vnd.google-apps.folder' and '{parent_id}' in parents and trashed=false"

    results = service.files().list(
        q=query,
        spaces='drive',
        fields='files(id, name)',
        supportsAllDrives=True,
        includeItemsFromAllDrives=True
    ).execute()

    files = results.get('files', [])

    if files:
        logger.info(f"Found existing folder: {folder_name} (ID: {files[0]['id']})")
        return files[0]['id']

    # Folder doesn't exist, create it
    file_metadata = {
        'name': folder_name,
        'mimeType': 'application/vnd.google-apps.folder',
        'parents': [parent_id]
    }

    try:
        folder = service.files().create(
            body=file_metadata,
            fields='id',
            supportsAllDrives=True
        ).execute()

        logger.info(f"Created folder: {folder_name} (ID: {folder.get('id')})")
        return folder.get('id')
    except Exception as e:
        logger.error(f"Error creating folder '{folder_name}': {e}")
        raise


def upload_to_drive(service, file_bytes: bytes, filename: str,
                   folder_id: str, mime_type: str = 'application/pdf') -> str:
    """
    Upload a file to Google Drive.

    Args:
        service: Authenticated Drive service
        file_bytes: File content as bytes
        filename: Name for the file
        folder_id: Parent folder ID
        mime_type: MIME type of file

    Returns:
        ID of uploaded file
    """
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
        fields='id,webViewLink',
        supportsAllDrives=True
    ).execute()

    logger.info(f"Uploaded file: {filename} (ID: {file.get('id')})")
    return file.get('id'), file.get('webViewLink')


def append_to_sheet(service, sheet_id: str, values: list):
    """
    Append a row to Google Sheets.
    
    Args:
        service: Authenticated Sheets service
        sheet_id: Spreadsheet ID
        values: List of values to append
    """
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




@functions_framework.cloud_event
def process_pdf(cloud_event):
    """
    Cloud Function triggered when a PDF is uploaded to GCS.
    
    Workflow:
    1. Download PDF from GCS
    2. Extract form fields using PyPDF2
    3. Create organized folder structure in Drive (Year/Project)
    4. Upload PDF to Drive
    5. Append extracted data to master Google Sheet
    
    The function uses actual field names from the PDF form directly,
    making it easy to maintain and update.
    """
    try:
        # Extract event data
        data = cloud_event.data
        bucket_name = data['bucket']
        file_path = data['name']
        
        logger.info(f"Processing PDF: gs://{bucket_name}/{file_path}")

        # Parse submission ID from path: submissions/YYYY/submission_id/pdf/filename.pdf
        path_parts = file_path.split('/')
        if len(path_parts) < 5:
            logger.error(f"Invalid path structure: {file_path}")
            return

        # Only process PDFs in the pdf/ subdirectory
        if path_parts[3] != 'pdf':
            logger.info(f"Skipping non-PDF path: {file_path}")
            return

        year = path_parts[1]
        submission_id = path_parts[2]
        filename = path_parts[4]
        
        # Download PDF
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(file_path)

        # Check if blob exists (handle deleted files)
        if not blob.exists():
            logger.warning(f"File not found (may have been deleted): {file_path}")
            return {'status': 'skipped', 'reason': 'file_not_found'}

        # Reload blob to get metadata including size
        blob.reload()

        # Check file size
        if blob.size > MAX_PDF_SIZE_MB * 1024 * 1024:
            logger.error(f"PDF too large: {blob.size} bytes")
            raise ValueError(f"PDF exceeds maximum size of {MAX_PDF_SIZE_MB}MB")
        
        pdf_bytes = blob.download_as_bytes()
        logger.info(f"Downloaded PDF: {len(pdf_bytes)} bytes")
        
        # Extract form fields
        fields = extract_pdf_fields(pdf_bytes)
        logger.info(f"Extracted {len(fields)} fields from PDF")
        
        # Use "Official Name" field for project folder name
        project_name = fields.get('Official Name', '').strip()
        if not project_name:
            # Fallback to submission ID if no project name
            project_name = f"Submission-{submission_id[:8]}"
        
        # Get Drive root folder ID
        drive_root_id = get_secret(DRIVE_FOLDER_SECRET)
        
        # Initialize Drive service
        drive_service = get_drive_service()
        
        # Create folder structure: Root > Year > Project
        # With impersonation, folders will be owned by the impersonated user
        year_folder_id = find_or_create_folder(drive_service, drive_root_id, year)
        project_folder_id = find_or_create_folder(drive_service, year_folder_id, project_name)
        
        # Upload PDF to Drive
        file_id, file_link = upload_to_drive(
            drive_service,
            pdf_bytes,
            filename,
            project_folder_id
        )
        
        # Prepare row for Sheets
        sheet_id = get_secret(SHEET_ID_SECRET)
        sheets_service = get_sheets_service()
        
        # Build row data matching the exact column order from the Sheet
        row_data = [
            datetime.now().isoformat(),                                      # Submission Timestamp
            submission_id,                                                   # Submission ID
            file_link,                                                       # PDF Link
            f"https://drive.google.com/drive/folders/{project_folder_id}",  # Project Folder
            fields.get('Official Name', ''),                                 # Official Name
            fields.get('Location', ''),                                      # Location
            fields.get('Project Category or Categories for Consideration', ''),  # Project Category
            fields.get('Cost', ''),                                          # Cost
            fields.get('Date Completed', ''),                                # Date Completed
            fields.get('Delivery Method', ''),                               # Delivery Method
            fields.get('Square Feet', ''),                                   # Square Feet
            fields.get('LevelsStories 1', ''),                               # Levels/Stories
            fields.get('Name of Firm', ''),                                  # Name of Firm
            fields.get('Contact Name', ''),                                  # Contact Name
            fields.get('Title', ''),                                         # Title
            fields.get('Phone 1', ''),                                       # Phone
            fields.get('Email', ''),                                         # Email
            fields.get('Owner', ''),                                         # Owner
            fields.get('Owners RepProject Manager', ''),                     # Owner's Rep/Project Manager
            fields.get('Design Team Firm PrincipalinCharge or Proj Mngr', ''),  # Design Team Firm
            fields.get('Architect', ''),                                     # Architect
            fields.get('Civil', ''),                                         # Civil
            fields.get('Electrical', ''),                                    # Electrical
            fields.get('Mechanical', ''),                                    # Mechanical
            fields.get('Structural', ''),                                    # Structural
            fields.get('Geotech', ''),                                       # Geotech
            fields.get('Interior Design', ''),                               # Interior Design
            fields.get('Furniture', ''),                                     # Furniture
            fields.get('Landscape Architect', ''),                           # Landscape Architect
            fields.get('Construction Team Firm Project Manager', ''),        # Construction Team Firm
            fields.get('General Contractor', ''),                            # General Contractor
            fields.get('Plumbing', ''),                                      # Plumbing
            fields.get('HVAC', ''),                                          # HVAC
            fields.get('Electrical_2', ''),                                  # Electrical_2
            fields.get('Concrete', ''),                                      # Concrete
            fields.get('Steel Fabrication', ''),                             # Steel Fabrication
            fields.get('Steel Erection', ''),                                # Steel Erection
            fields.get('GlassCurtain Wall', ''),                             # Glass/Curtain Wall
            fields.get('Masonry', ''),                                       # Masonry
            fields.get('DrywallAcoustics', ''),                              # Drywall/Acoustics
            fields.get('Painting', ''),                                      # Painting
            fields.get('TileStone', ''),                                     # Tile/Stone
            fields.get('Carpentry', ''),                                     # Carpentry
            fields.get('Flooring', ''),                                      # Flooring
            fields.get('Roofing', ''),                                       # Roofing
            fields.get('Waterproofing', ''),                                 # Waterproofing
            fields.get('Excavation', ''),                                    # Excavation
            fields.get('Demolition', ''),                                    # Demolition
            fields.get('Precast', ''),                                       # Precast
            fields.get('Landscaping 1', ''),                                 # Landscaping
            fields.get('Project Overview', ''),                              # Project Overview
            fields.get('Innovation in Design and Construction', ''),         # Innovation
            fields.get('Aesthetics/Design Elements', ''),                    # Aesthetics/Design Elements
            fields.get('Safety, Quality, Craftsmanship', ''),                # Safety, Quality, Craftsmanship
            fields.get('Contribution to the Industry and Community', ''),    # Contribution to Industry
            fields.get('Overcoming Unique Challenges/Obstacles', ''),        # Overcoming Challenges
        ]
        
        # Append to master sheet
        append_to_sheet(sheets_service, sheet_id, row_data)
        
        logger.info(f"Successfully processed submission: {submission_id}")
        
        return {
            'status': 'success',
            'submission_id': submission_id,
            'drive_folder_id': project_folder_id,
            'file_id': file_id
        }
        
    except Exception as e:
        logger.error(f"Error processing PDF: {e}", exc_info=True)
        # Re-raise to trigger retry
        raise

