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
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from google.oauth2 import service_account
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


def get_drive_service():
    """Get authenticated Google Drive service."""
    # Using default credentials (service account)
    credentials, _ = service_account.Credentials.from_service_account_info(
        {}, scopes=['https://www.googleapis.com/auth/drive']
    )
    return build('drive', 'v3', credentials=credentials)


def get_sheets_service():
    """Get authenticated Google Sheets service."""
    credentials, _ = service_account.Credentials.from_service_account_info(
        {}, scopes=['https://www.googleapis.com/auth/spreadsheets']
    )
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
        fields='id,webViewLink'
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
    3. Create organized folder structure in Drive (Year/Month/Project)
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
        
        # Parse submission ID from path: submissions/YYYY/MM/submission_id/pdf/filename.pdf
        path_parts = file_path.split('/')
        if len(path_parts) < 6:
            logger.error(f"Invalid path structure: {file_path}")
            return
        
        # Only process PDFs in the pdf/ subdirectory
        if path_parts[4] != 'pdf':
            logger.info(f"Skipping non-PDF path: {file_path}")
            return
        
        year = path_parts[1]
        month = path_parts[2]
        submission_id = path_parts[3]
        filename = path_parts[5]
        
        # Download PDF
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(file_path)
        
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
        
        # Create folder structure: Root > Year > Month > Project
        year_folder_id = create_drive_folder(drive_service, drive_root_id, year)
        month_folder_id = create_drive_folder(drive_service, year_folder_id, f"{year}-{month}")
        project_folder_id = create_drive_folder(drive_service, month_folder_id, project_name)
        
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
        
        # Build row data using actual field names from the PDF form
        row_data = [
            datetime.now().isoformat(),                      # Submission timestamp
            submission_id,                                   # Unique submission ID
            fields.get('Official Name', ''),                 # Project name
            fields.get('Location', ''),                      # Location
            fields.get('Cost', ''),                          # Project cost
            fields.get('Date Completed', ''),                # Completion date
            fields.get('Name of Firm', ''),                  # Company name
            fields.get('Contact Name', ''),                  # Contact name
            fields.get('Email', ''),                         # Contact email
            fields.get('Phone 1', ''),                       # Contact phone
            file_link,                                       # Link to PDF in Drive
            f"https://drive.google.com/drive/folders/{project_folder_id}",  # Project folder
            json.dumps(fields, indent=2)                     # All fields as JSON
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

