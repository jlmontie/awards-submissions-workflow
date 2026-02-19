"""
Script to fetch files from a shared Google Drive folder.

This script uses OAuth2 authentication to access Google Drive files that have been
shared with your account. On first run, it will open a browser for authentication
and save credentials for future use.
"""

import os
import pickle
import re
from pathlib import Path
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
import io

# If modifying these scopes, delete the file token.pickle.
SCOPES = ['https://www.googleapis.com/auth/drive.readonly']


def authenticate_google_drive():
    """
    Authenticate and return Google Drive service object.
    Credentials are saved to 'token.pickle' for future use.
    """
    creds = None
    
    # The file token.pickle stores the user's access and refresh tokens.
    if os.path.exists('token.pickle'):
        with open('token.pickle', 'rb') as token:
            creds = pickle.load(token)
    
    # If there are no (valid) credentials available, let the user log in.
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            # You need to download credentials.json from Google Cloud Console
            # Go to: https://console.cloud.google.com/apis/credentials
            # Create OAuth 2.0 Client ID credentials and download as credentials.json
            if not os.path.exists('credentials.json'):
                raise FileNotFoundError(
                    "credentials.json not found. Please download it from "
                    "https://console.cloud.google.com/apis/credentials"
                )
            flow = InstalledAppFlow.from_client_secrets_file(
                'credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)
        
        # Save the credentials for the next run
        with open('token.pickle', 'wb') as token:
            pickle.dump(creds, token)
    
    service = build('drive', 'v3', credentials=creds)
    return service


def sanitize_filename(filename):
    """
    Sanitize a filename to be filesystem-safe.
    Removes or replaces characters that are invalid in filenames.
    """
    # Remove or replace invalid characters
    filename = re.sub(r'[<>:"/\\|?*]', '_', filename)
    # Remove leading/trailing spaces and dots
    filename = filename.strip(' .')
    # Replace multiple consecutive underscores/spaces with single underscore
    filename = re.sub(r'[_\s]+', '_', filename)
    # Ensure filename is not empty
    if not filename:
        filename = 'unnamed'
    return filename


def normalize_folder_name(folder_name):
    """
    Normalize folder names to correct inconsistencies.
    Standardizes numeric prefixes: converts "2_" to "2." format.
    For example: "2_Some_Folder" -> "2.Some_Folder"
    """
    # Pattern to match numeric prefix followed by underscore or dot
    # Matches: "1.", "2_", "10.", "99_", etc.
    pattern = r'^(\d+)[._](.+)$'
    match = re.match(pattern, folder_name)
    
    if match:
        number = match.group(1)
        rest = match.group(2)
        # Standardize to use dot: "1.Rest_of_name"
        return f"{number}.{rest}"
    
    # If no numeric prefix pattern found, return sanitized version
    return sanitize_filename(folder_name)


def download_file(service, file_id, output_path=None):
    """
    Download a file from Google Drive.
    
    Args:
        service: Google Drive service object
        file_id: ID of the file to download
        output_path: Local path to save the file (optional)
    
    Returns:
        File content as bytes, or None if saved to disk
    """
    file_metadata = service.files().get(fileId=file_id).execute()
    file_name = file_metadata.get('name', 'download')
    
    # Handle Google Workspace files (Docs, Sheets, etc.) - export as PDF
    mime_type = file_metadata.get('mimeType', '')
    if 'google-apps' in mime_type:
        if 'document' in mime_type:
            request = service.files().export_media(fileId=file_id, mimeType='application/pdf')
            if not output_path:
                base_name = file_name.replace('.gdoc', '')
                output_path = sanitize_filename(base_name) + '.pdf'
        elif 'spreadsheet' in mime_type:
            request = service.files().export_media(fileId=file_id, mimeType='application/pdf')
            if not output_path:
                base_name = file_name.replace('.gsheet', '')
                output_path = sanitize_filename(base_name) + '.pdf'
        else:
            # For other Google Workspace files, try to export as PDF
            request = service.files().export_media(fileId=file_id, mimeType='application/pdf')
            if not output_path:
                output_path = sanitize_filename(file_name) + '.pdf'
    else:
        # Regular file download
        request = service.files().get_media(fileId=file_id)
        if not output_path:
            output_path = sanitize_filename(file_name)
    
    if output_path:
        # Ensure parent directory exists
        parent_dir = os.path.dirname(output_path)
        if parent_dir:
            os.makedirs(parent_dir, exist_ok=True)
        fh = io.FileIO(output_path, 'wb')
        downloader = MediaIoBaseDownload(fh, request)
        done = False
        while done is False:
            status, done = downloader.next_chunk()
            print(f"  Download {int(status.progress() * 100)}% complete: {os.path.basename(output_path)}")
        return None
    else:
        # Return bytes
        fh = io.BytesIO()
        downloader = MediaIoBaseDownload(fh, request)
        done = False
        while done is False:
            status, done = downloader.next_chunk()
        return fh.getvalue()


def is_pdf_file(file_item):
    """Check if a file is a PDF (by mimeType or extension)."""
    mime_type = file_item.get('mimeType', '').lower()
    file_name = file_item.get('name', '').lower()
    
    # Check mimeType
    if mime_type == 'application/pdf':
        return True
    
    # Check file extension
    if file_name.endswith('.pdf'):
        return True
    
    # Google Docs can be exported as PDF
    if 'google-apps.document' in mime_type:
        return True
    
    return False


def sync_folder_structure(service, folder_id=None, folder_name=None, local_base_path='data'):
    """
    Recursively sync Google Drive folder structure, downloading only PDF files.
    
    Creates a 'data' folder (or specified path) and replicates the folder structure
    from Google Drive, but only downloads PDF files. Folder names are normalized
    to correct inconsistencies (e.g., "2_" -> "2.").
    
    Args:
        service: Google Drive service object
        folder_id: ID of the root folder to sync (if known)
        folder_name: Name of the root folder to sync (if folder_id not provided)
        local_base_path: Local base directory to create (default: 'data')
    
    Returns:
        Dictionary with sync statistics
    """
    # Create base directory
    base_path = Path(local_base_path)
    base_path.mkdir(exist_ok=True)
    print(f"Created base directory: {base_path.absolute()}")
    
    # Find root folder
    if folder_id:
        root_folder_query = f"id='{folder_id}' and trashed=false"
    elif folder_name:
        root_folder_query = f"name='{folder_name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    else:
        raise ValueError("Either folder_id or folder_name must be provided")
    
    folder_results = service.files().list(q=root_folder_query, fields="files(id, name)").execute()
    folders = folder_results.get('files', [])
    
    if not folders:
        raise ValueError(f"Folder not found: {folder_name if folder_name else folder_id}")
    if len(folders) > 1:
        print("Warning: Multiple folders found. Using first one.")
    
    root_folder_id = folders[0]['id']
    root_folder_name = folders[0]['name']
    
    print(f"\nSyncing folder: {root_folder_name}")
    print(f"Root folder ID: {root_folder_id}")
    print("Only PDF files will be downloaded.")
    print("-" * 60)
    
    stats = {'folders_created': 0, 'files_downloaded': 0, 'files_skipped': 0, 'errors': []}
    
    def sync_folder_recursive(folder_id, local_path):
        """Recursively sync a folder and its contents."""
        # List all items in this folder
        query = f"'{folder_id}' in parents and trashed=false"
        results = service.files().list(
            q=query,
            fields="files(id, name, mimeType)",
            pageSize=1000
        ).execute()
        
        items = results.get('files', [])
        
        # Separate folders and files
        subfolders = [item for item in items if item['mimeType'] == 'application/vnd.google-apps.folder']
        files = [item for item in items if item['mimeType'] != 'application/vnd.google-apps.folder']
        
        # Create local directory
        local_path.mkdir(parents=True, exist_ok=True)
        if local_path != base_path:  # Don't count base path
            stats['folders_created'] += 1
            print(f"Created folder: {local_path.relative_to(base_path)}")
        
        # Download only PDF files in this folder
        for file_item in files:
            # Only process PDF files
            if not is_pdf_file(file_item):
                continue
            
            file_name = file_item['name']
            
            # Handle Google Docs - export as PDF
            mime_type = file_item.get('mimeType', '')
            if 'google-apps.document' in mime_type:
                # Remove .gdoc extension if present
                base_name = file_name.replace('.gdoc', '').replace('.gsheet', '')
                if not base_name.endswith('.pdf'):
                    base_name += '.pdf'
                file_name = base_name
            
            # Ensure it ends with .pdf
            if not file_name.lower().endswith('.pdf'):
                file_name += '.pdf'
            
            file_name = sanitize_filename(file_name)
            file_path = local_path / file_name
            
            # Skip if file already exists
            if file_path.exists():
                print(f"  Skipping (exists): {file_path.relative_to(base_path)}")
                stats['files_skipped'] += 1
                continue
            
            try:
                print(f"  Downloading: {file_path.relative_to(base_path)}")
                download_file(service, file_item['id'], str(file_path))
                stats['files_downloaded'] += 1
            except Exception as e:
                error_msg = f"Error downloading {file_item['name']}: {str(e)}"
                print(f"  ERROR: {error_msg}")
                stats['errors'].append(error_msg)
        
        # Recursively process subfolders
        for folder_item in subfolders:
            # Normalize folder name to fix inconsistencies
            folder_name = normalize_folder_name(folder_item['name'])
            if 'photo' in folder_name.lower():
                continue
            subfolder_path = local_path / folder_name
            sync_folder_recursive(folder_item['id'], subfolder_path)
    
    # Start recursive sync
    sync_folder_recursive(root_folder_id, base_path)
    
    return stats


def main():
    """Recursively download PDF files from Google Drive, preserving folder structure"""
    # Authenticate
    print("Authenticating with Google Drive...")
    service = authenticate_google_drive()
    print("Authentication successful!")
    
    # Sync folder structure
    # Option 1: Sync by folder name
    try:
        stats = sync_folder_structure(
            service, 
            folder_name="1.Submissions_Winners",  # Change this to your folder name
            local_base_path='data'
        )
        
        print("\n" + "=" * 60)
        print("Sync Complete!")
        print(f"Folders created: {stats['folders_created']}")
        print(f"PDFs downloaded: {stats['files_downloaded']}")
        print(f"PDFs skipped (already exist): {stats['files_skipped']}")
        if stats['errors']:
            print(f"Errors: {len(stats['errors'])}")
            for error in stats['errors']:
                print(f"  - {error}")
        print("=" * 60)
        
    except ValueError as e:
        print(f"Error: {e}")
        print("\nTo sync a different folder, modify the folder_name parameter")
        print("or use folder_id if you know the Google Drive folder ID")
    
    # Option 2: Sync by folder ID (uncomment and modify as needed)
    # stats = sync_folder_structure(
    #     service,
    #     folder_id="YOUR_FOLDER_ID_HERE",
    #     local_base_path='data'
    # )


if __name__ == '__main__':
    main()

