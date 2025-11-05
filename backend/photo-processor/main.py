"""
Cloud Function to process uploaded photo submissions.
Organizes photos into Drive folders and optionally processes images.
"""
import os
import logging
from typing import Optional
import functions_framework
from google.cloud import storage, secretmanager
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from google.oauth2 import service_account
from PIL import Image
import io

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Environment variables
PROJECT_ID = os.environ.get('GCP_PROJECT_ID')
DRIVE_FOLDER_SECRET = os.environ.get('DRIVE_FOLDER_SECRET')
SUBMISSIONS_BUCKET = os.environ.get('SUBMISSIONS_BUCKET')
MAX_PHOTO_SIZE_MB = int(os.environ.get('MAX_PHOTO_SIZE_MB', 20))

# Image processing settings
MAX_DIMENSION = 4096  # Max width/height in pixels
JPEG_QUALITY = 90

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
    credentials, _ = service_account.Credentials.from_service_account_info(
        {}, scopes=['https://www.googleapis.com/auth/drive']
    )
    return build('drive', 'v3', credentials=credentials)


def process_image(image_bytes: bytes, filename: str) -> tuple[bytes, str]:
    """
    Process image: normalize format, resize if needed, strip EXIF.
    
    Args:
        image_bytes: Original image bytes
        filename: Original filename
        
    Returns:
        Tuple of (processed_bytes, mime_type)
    """
    try:
        image = Image.open(io.BytesIO(image_bytes))
        
        # Convert HEIC or other formats to JPEG
        if image.format in ['HEIC', 'HEIF']:
            logger.info(f"Converting {image.format} to JPEG")
            filename = filename.rsplit('.', 1)[0] + '.jpg'
        
        # Resize if too large
        if max(image.size) > MAX_DIMENSION:
            logger.info(f"Resizing image from {image.size}")
            image.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.Resampling.LANCZOS)
        
        # Convert to RGB if necessary (for JPEG)
        if image.mode in ('RGBA', 'LA', 'P'):
            background = Image.new('RGB', image.size, (255, 255, 255))
            if image.mode == 'P':
                image = image.convert('RGBA')
            background.paste(image, mask=image.split()[-1] if image.mode in ('RGBA', 'LA') else None)
            image = background
        
        # Save as JPEG with no EXIF
        output = io.BytesIO()
        image.save(output, format='JPEG', quality=JPEG_QUALITY, optimize=True)
        processed_bytes = output.getvalue()
        
        logger.info(f"Processed image: {len(image_bytes)} -> {len(processed_bytes)} bytes")
        return processed_bytes, 'image/jpeg'
        
    except Exception as e:
        logger.warning(f"Error processing image, using original: {e}")
        # Return original if processing fails
        mime_type = 'image/jpeg'
        if filename.lower().endswith('.png'):
            mime_type = 'image/png'
        elif filename.lower().endswith('.gif'):
            mime_type = 'image/gif'
        return image_bytes, mime_type


def find_folder_by_name(service, parent_id: str, folder_name: str) -> Optional[str]:
    """
    Find a folder by name in a parent folder.
    
    Args:
        service: Authenticated Drive service
        parent_id: Parent folder ID
        folder_name: Name to search for
        
    Returns:
        Folder ID if found, None otherwise
    """
    query = f"name='{folder_name}' and mimeType='application/vnd.google-apps.folder' and '{parent_id}' in parents and trashed=false"
    
    results = service.files().list(
        q=query,
        spaces='drive',
        fields='files(id, name)'
    ).execute()
    
    files = results.get('files', [])
    if files:
        return files[0]['id']
    return None


def get_project_folder(service, root_id: str, year: str, month: str, 
                       submission_id: str) -> Optional[str]:
    """
    Navigate the folder structure to find the project folder.
    Structure: Root > Year > Month > Project
    
    Args:
        service: Authenticated Drive service
        root_id: Root folder ID
        year: Year (YYYY)
        month: Month (MM)
        submission_id: Submission ID to identify project
        
    Returns:
        Project folder ID if found, None otherwise
    """
    # Find year folder
    year_folder_id = find_folder_by_name(service, root_id, year)
    if not year_folder_id:
        logger.warning(f"Year folder not found: {year}")
        return None
    
    # Find month folder
    month_folder_name = f"{year}-{month}"
    month_folder_id = find_folder_by_name(service, year_folder_id, month_folder_name)
    if not month_folder_id:
        logger.warning(f"Month folder not found: {month_folder_name}")
        return None
    
    # Find project folder - it should be created by PDF processor
    # We'll search for folders in this month and look for metadata matching submission_id
    query = f"mimeType='application/vnd.google-apps.folder' and '{month_folder_id}' in parents and trashed=false"
    
    results = service.files().list(
        q=query,
        spaces='drive',
        fields='files(id, name, description)'
    ).execute()
    
    folders = results.get('files', [])
    
    # For now, return the first folder (assumes PDF created it)
    # In production, you might add description/properties to match submission_id
    if folders:
        return folders[0]['id']
    
    logger.warning(f"Project folder not found for submission: {submission_id}")
    return None


def upload_photo_to_drive(service, photo_bytes: bytes, filename: str, 
                         folder_id: str, mime_type: str = 'image/jpeg') -> str:
    """
    Upload a photo to Google Drive.
    
    Args:
        service: Authenticated Drive service
        photo_bytes: Photo content as bytes
        filename: Name for the file
        folder_id: Parent folder ID
        mime_type: MIME type of photo
        
    Returns:
        ID of uploaded file
    """
    file_metadata = {
        'name': filename,
        'parents': [folder_id]
    }
    
    media = MediaIoBaseUpload(
        io.BytesIO(photo_bytes),
        mimetype=mime_type,
        resumable=True
    )
    
    file = service.files().create(
        body=file_metadata,
        media_body=media,
        fields='id,webViewLink'
    ).execute()
    
    logger.info(f"Uploaded photo: {filename} (ID: {file.get('id')})")
    return file.get('id')


@functions_framework.cloud_event
def process_photo(cloud_event):
    """
    Cloud Function triggered when a photo is uploaded to GCS.
    
    Workflow:
    1. Download photo from GCS
    2. Process/normalize image (resize, convert format, strip EXIF)
    3. Find corresponding Drive folder (created by PDF processor)
    4. Upload processed photo to Drive
    """
    try:
        # Extract event data
        data = cloud_event.data
        bucket_name = data['bucket']
        file_path = data['name']
        
        logger.info(f"Processing photo: gs://{bucket_name}/{file_path}")
        
        # Parse submission ID from path: submissions/YYYY/MM/submission_id/photos/filename.jpg
        path_parts = file_path.split('/')
        if len(path_parts) < 6:
            logger.error(f"Invalid path structure: {file_path}")
            return
        
        # Only process photos in the photos/ subdirectory
        if path_parts[4] != 'photos':
            logger.info(f"Skipping non-photo path: {file_path}")
            return
        
        year = path_parts[1]
        month = path_parts[2]
        submission_id = path_parts[3]
        filename = path_parts[5]
        
        # Download photo
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(file_path)
        
        # Check file size
        if blob.size > MAX_PHOTO_SIZE_MB * 1024 * 1024:
            logger.error(f"Photo too large: {blob.size} bytes")
            raise ValueError(f"Photo exceeds maximum size of {MAX_PHOTO_SIZE_MB}MB")
        
        photo_bytes = blob.download_as_bytes()
        logger.info(f"Downloaded photo: {len(photo_bytes)} bytes")
        
        # Process image
        processed_bytes, mime_type = process_image(photo_bytes, filename)
        
        # Get Drive root folder ID
        drive_root_id = get_secret(DRIVE_FOLDER_SECRET)
        
        # Initialize Drive service
        drive_service = get_drive_service()
        
        # Find project folder
        project_folder_id = get_project_folder(
            drive_service,
            drive_root_id,
            year,
            month,
            submission_id
        )
        
        if not project_folder_id:
            logger.error(f"Could not find project folder for submission: {submission_id}")
            # Retry later - PDF processor might not have run yet
            raise ValueError("Project folder not found - will retry")
        
        # Upload photo to Drive
        file_id = upload_photo_to_drive(
            drive_service,
            processed_bytes,
            filename,
            project_folder_id,
            mime_type
        )
        
        logger.info(f"Successfully processed photo for submission: {submission_id}")
        
        return {
            'status': 'success',
            'submission_id': submission_id,
            'file_id': file_id
        }
        
    except Exception as e:
        logger.error(f"Error processing photo: {e}", exc_info=True)
        # Re-raise to trigger retry
        raise

