"""
Cloud Function to process uploaded PDF submissions.
Extracts form fields and creates organized folders in Google Drive.
"""
import os
import json
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List
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


def extract_project_team(fields: Dict[str, Any]) -> Dict[str, Dict[str, str]]:
    """
    Extract and structure project team member information from PDF fields.
    
    This organizes all team member data for easy export to team sheets,
    yearbook materials, and awards ceremony programs.
    
    Args:
        fields: Dictionary of all PDF form fields
    
    Returns:
        Dictionary organized by team category with member details
        
    Example return structure:
        {
            'project_info': {
                'name': 'Black Desert Resort',
                'location': 'Ivins, Utah',
                ...
            },
            'owner': {
                'company': 'Black Desert Development',
                'rep': 'John Smith'
            },
            'design_team': {
                'architect': 'Smith Architecture',
                'civil': 'Jones Engineering',
                ...
            },
            'construction_team': {
                'general_contractor': 'ABC Construction',
                'concrete': 'XYZ Concrete',
                ...
            }
        }
    """
    team_data = {
        'project_info': {
            'name': fields.get('Official Name', ''),
            'location': fields.get('Location', ''),
            'category': fields.get('Project Category or Categories for Consideration', ''),
            'cost': fields.get('Cost', ''),
            'date_completed': fields.get('Date Completed', ''),
            'square_feet': fields.get('Square Feet', ''),
            'levels': fields.get('LevelsStories 1', ''),
        },
        'owner': {
            'company': fields.get('Owner', ''),
            'rep_project_manager': fields.get('Owners RepProject Manager', ''),
        },
        'design_team': {
            'firm': fields.get('Design Team Firm PrincipalinCharge or Proj Mngr', ''),
            'architect': fields.get('Architect', ''),
            'civil': fields.get('Civil', ''),
            'structural': fields.get('Structural', ''),
            'electrical': fields.get('Electrical', ''),
            'mechanical': fields.get('Mechanical', ''),
            'geotech': fields.get('Geotech', ''),
            'interior_design': fields.get('Interior Design', ''),
            'furniture': fields.get('Furniture', ''),
            'landscape_architect': fields.get('Landscape Architect', ''),
        },
        'construction_team': {
            'firm': fields.get('Construction Team Firm Project Manager', ''),
            'general_contractor': fields.get('General Contractor', ''),
            'plumbing': fields.get('Plumbing', ''),
            'hvac': fields.get('HVAC', ''),
            'electrical': fields.get('Electrical_2', ''),
            'concrete': fields.get('Concrete', ''),
            'steel_fabrication': fields.get('Steel Fabrication', ''),
            'steel_erection': fields.get('Steel Erection', ''),
            'glass_curtain_wall': fields.get('GlassCurtain Wall', ''),
            'masonry': fields.get('Masonry', ''),
            'drywall_acoustics': fields.get('DrywallAcoustics', ''),
            'painting': fields.get('Painting', ''),
            'tile_stone': fields.get('TileStone', ''),
            'carpentry': fields.get('Carpentry', ''),
            'flooring': fields.get('Flooring', ''),
            'roofing': fields.get('Roofing', ''),
            'waterproofing': fields.get('Waterproofing', ''),
            'excavation': fields.get('Excavation', ''),
            'demolition': fields.get('Demolition', ''),
            'precast': fields.get('Precast', ''),
            'landscaping': fields.get('Landscaping 1', ''),
        },
        'contact': {
            'firm': fields.get('Name of Firm', ''),
            'name': fields.get('Contact Name', ''),
            'title': fields.get('Title', ''),
            'phone': fields.get('Phone 1', ''),
            'email': fields.get('Email', ''),
        }
    }
    
    return team_data


def format_team_for_sheet_row(awards_id: str, team_data: Dict[str, Dict[str, str]]) -> List[str]:
    """
    Format project team data as a flat row for Google Sheets export.
    
    This creates a row suitable for the "Project Team" sheet that's used
    for awards ceremony materials, yearbook, and video presentations.
    
    Args:
        awards_id: Awards ID (e.g., "AW-2025-042")
        team_data: Structured team data from extract_project_team()
    
    Returns:
        List of values in the correct column order for the team sheet
    """
    project = team_data['project_info']
    owner = team_data['owner']
    design = team_data['design_team']
    construction = team_data['construction_team']
    contact = team_data['contact']
    
    return [
        awards_id,                              # Awards ID
        project['name'],                        # Project Name
        project['location'],                    # Location
        project['category'],                    # Category
        project['cost'],                        # Cost
        project['date_completed'],              # Date Completed
        project['square_feet'],                 # Square Feet
        owner['company'],                       # Owner
        owner['rep_project_manager'],           # Owner's Rep
        design['architect'],                    # Architect
        design['firm'],                         # Design Firm
        design['civil'],                        # Civil Engineer
        design['structural'],                   # Structural Engineer
        design['mechanical'],                   # Mechanical Engineer
        design['electrical'],                   # Electrical Engineer
        design['interior_design'],              # Interior Design
        design['landscape_architect'],          # Landscape Architect
        construction['general_contractor'],     # General Contractor
        construction['firm'],                   # Construction Firm
        construction['concrete'],               # Concrete
        construction['steel_fabrication'],      # Steel Fabrication
        construction['steel_erection'],         # Steel Erection
        construction['plumbing'],               # Plumbing
        construction['hvac'],                   # HVAC
        construction['electrical'],             # Electrical (construction)
        construction['glass_curtain_wall'],     # Glass/Curtain Wall
        construction['masonry'],                # Masonry
        construction['drywall_acoustics'],      # Drywall/Acoustics
        construction['painting'],               # Painting
        construction['tile_stone'],             # Tile/Stone
        construction['carpentry'],              # Carpentry
        construction['flooring'],               # Flooring
        construction['roofing'],                # Roofing
        construction['waterproofing'],          # Waterproofing
        construction['excavation'],             # Excavation
        construction['demolition'],             # Demolition
        construction['precast'],                # Precast
        construction['landscaping'],            # Landscaping
        contact['firm'],                        # Contact Firm
        contact['name'],                        # Contact Name
        contact['email'],                       # Contact Email
        contact['phone'],                       # Contact Phone
    ]


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


def generate_awards_id(service, sheet_id: str, year: str) -> str:
    """
    Generate unique Awards ID in format: AW-YYYY-NNN
    
    This function queries the sheet for existing IDs from the current year,
    finds the highest number, and increments by 1.
    
    Args:
        service: Authenticated Sheets service
        sheet_id: Spreadsheet ID
        year: Year (YYYY format string)
    
    Returns:
        Unique Awards ID (e.g., "AW-2025-042")
    
    Example:
        - First submission of 2025: AW-2025-001
        - 42nd submission of 2025: AW-2025-042
        - First submission of 2026: AW-2026-001
    """
    try:
        # Query the entire sheet to find all Awards IDs
        # Awards ID is in the last 4 columns we're adding (see schema update guide)
        # We'll scan all columns to find existing IDs
        result = service.spreadsheets().values().get(
            spreadsheetId=sheet_id,
            range='Sheet1!A:ZZ'  # Get all columns
        ).execute()
        
        values = result.get('values', [])
        
        # Search all cells for Awards IDs matching current year pattern
        prefix = f'AW-{year}-'
        current_year_numbers = []
        
        for row in values:
            for cell in row:
                if isinstance(cell, str) and cell.startswith(prefix):
                    try:
                        # Extract the number part: AW-YYYY-NNN → NNN
                        parts = cell.split('-')
                        if len(parts) == 3:
                            number = int(parts[2])
                            current_year_numbers.append(number)
                    except (ValueError, IndexError):
                        # Skip malformed IDs
                        continue
        
        # Determine next number
        if not current_year_numbers:
            # First submission of the year
            next_number = 1
            logger.info(f"Generating first Awards ID for year {year}")
        else:
            # Increment from highest existing number
            next_number = max(current_year_numbers) + 1
            logger.info(f"Generating Awards ID #{next_number} for year {year}")
        
        # Format with leading zeros: AW-YYYY-NNN
        awards_id = f"AW-{year}-{next_number:03d}"
        logger.info(f"Generated Awards ID: {awards_id}")
        
        return awards_id
        
    except Exception as e:
        logger.error(f"Error generating Awards ID: {e}")
        # Fallback to timestamp-based ID if generation fails
        fallback_id = f"AW-{year}-TMP{int(datetime.now().timestamp())}"
        logger.warning(f"Using fallback ID: {fallback_id}")
        return fallback_id


def format_confirmation_email(awards_id: str, project_name: str, contact_name: str, 
                             contact_email: str, fields: Dict[str, Any]) -> Dict[str, str]:
    """
    Format confirmation email with submission details and Awards ID.
    
    This function creates the email content that will be sent to submitters.
    Email sending will be implemented in Phase 3 with SendGrid.
    
    Args:
        awards_id: Unique Awards ID (e.g., "AW-2025-042")
        project_name: Project name
        contact_name: Submitter name
        contact_email: Submitter email
        fields: All extracted PDF fields
    
    Returns:
        Dictionary with 'subject', 'body', and 'to' keys
    """
    submission_date = datetime.now().strftime('%B %d, %Y at %I:%M %p')
    
    subject = f"Award Submission Confirmed - {awards_id}"
    
    body = f"""
Dear {contact_name},

Thank you for submitting "{project_name}" to the 2025 Utah Construction & Design Excellence Awards!

Your submission has been received and assigned:

    Submission ID: {awards_id}

Please save this ID for your records. You can reference it if you need to contact us about your submission.

SUBMISSION DETAILS:
-------------------
Project: {project_name}
Category: {fields.get('Project Category or Categories for Consideration', 'Not specified')}
Submitted: {submission_date}
Status: Under Review

NEXT STEPS:
-----------
• Our panel of judges will review all submissions in January 2026
• Winners will be announced at the awards ceremony in February 2026
• You will be notified via email by February 1, 2026

Questions? Please reply to this email or contact:

Ladd Marshall
Utah Construction & Design
Email: lmarshall@utahcdmag.com
Phone: 801-872-3531

Thank you for your participation in celebrating excellence in Utah construction!

Best regards,
The UC+D Awards Team

---
Submission ID: {awards_id}
This is an automated confirmation. Please keep this email for your records.
""".strip()
    
    return {
        'to': contact_email,
        'subject': subject,
        'body': body
    }


def log_confirmation_email(email_data: Dict[str, str]):
    """
    Log confirmation email details.
    
    In Phase 1, we log the email content for manual sending if needed.
    In Phase 3, this will be replaced with actual SendGrid integration.
    
    Args:
        email_data: Dictionary with 'to', 'subject', 'body' keys
    """
    logger.info("=" * 60)
    logger.info("CONFIRMATION EMAIL READY TO SEND")
    logger.info("=" * 60)
    logger.info(f"To: {email_data['to']}")
    logger.info(f"Subject: {email_data['subject']}")
    logger.info("-" * 60)
    logger.info("Body:")
    logger.info(email_data['body'])
    logger.info("=" * 60)
    logger.info("NOTE: Automatic email sending will be implemented in Phase 3")
    logger.info("For now, client can send confirmation emails manually if needed")
    logger.info("=" * 60)


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
        
        # Generate unique Awards ID for this submission
        awards_id = generate_awards_id(sheets_service, sheet_id, year)
        logger.info(f"Generated Awards ID: {awards_id} for submission {submission_id}")
        
        # Build row data matching the exact column order from the Sheet
        row_data = [
            datetime.now().isoformat(),                                      # Submission Timestamp
            submission_id,                                                   # Submission ID (GCS)
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
            # NEW FIELDS for Phase 1: Awards ID System
            awards_id,                                                       # Awards ID (AW-YYYY-NNN)
            'pending',                                                       # Status (pending/winner/not_selected)
            '',                                                              # Winner Category (empty initially)
            '',                                                              # Winner Notes (empty initially)
        ]
        
        # Append to master sheet
        append_to_sheet(sheets_service, sheet_id, row_data)
        
        # Generate and log confirmation email
        contact_name = fields.get('Contact Name', 'Submitter')
        contact_email = fields.get('Email', '')
        
        if contact_email:
            email_data = format_confirmation_email(
                awards_id=awards_id,
                project_name=project_name,
                contact_name=contact_name,
                contact_email=contact_email,
                fields=fields
            )
            log_confirmation_email(email_data)
        else:
            logger.warning("No contact email found - cannot send confirmation")
        
        logger.info(f"Successfully processed submission: {submission_id} ({awards_id})")
        
        return {
            'status': 'success',
            'submission_id': submission_id,
            'awards_id': awards_id,
            'drive_folder_id': project_folder_id,
            'file_id': file_id
        }
        
    except Exception as e:
        logger.error(f"Error processing PDF: {e}", exc_info=True)
        # Re-raise to trigger retry
        raise

