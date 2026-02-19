# Google Drive API Setup Guide

This guide will help you set up programmatic access to Google Drive files that have been shared with you.

## Step 1: Enable Google Drive API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Drive API:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Drive API"
   - Click "Enable"

## Step 2: Create OAuth 2.0 Credentials

1. Go to [Credentials](https://console.cloud.google.com/apis/credentials)
2. Click "Create Credentials" > "OAuth client ID"
3. If prompted, configure the OAuth consent screen:
   - Choose "External" (unless you have a Google Workspace account)
   - Fill in the required fields (App name, User support email, etc.)
   - Add your email as a test user
   - Save and continue through the scopes (default is fine)
4. For Application type, select "Desktop app"
5. Give it a name (e.g., "Drive File Fetcher")
6. Click "Create"
7. Download the credentials file and save it as `credentials.json` in this directory

## Step 3: Install Dependencies

Install the required Python packages:
```bash
pip install -r requirements.txt
```

## Step 4: Run the Script

1. Make sure `credentials.json` is in the same directory as `fetch_google_drive_assets.py`
2. Run the script:
   ```bash
   python fetch_google_drive_assets.py
   ```
3. On first run, a browser window will open asking you to sign in and grant permissions
4. After authentication, `token.pickle` will be created for future use

## Usage Examples

### List files in a shared folder:
```python
from fetch_google_drive_assets import authenticate_google_drive, list_files_in_folder

service = authenticate_google_drive()
files = list_files_in_folder(service, folder_name="My Shared Folder")
for file in files:
    print(f"{file['name']} - {file['id']}")
```

### Download a file:
```python
from fetch_google_drive_assets import authenticate_google_drive, download_file

service = authenticate_google_drive()
download_file(service, file_id="YOUR_FILE_ID", output_path="downloaded_file.pdf")
```

### Access files by folder ID:
If you have the folder ID from the Google Drive URL, you can use it directly:
```python
files = list_files_in_folder(service, folder_id="1ABC123xyz...")
```

## Notes

- The script uses read-only access (`drive.readonly` scope)
- Credentials are stored locally in `token.pickle` (don't commit this to git!)
- Shared folders will appear in your "Shared with me" section and can be accessed programmatically
- Google Workspace files (Docs, Sheets) will be exported as PDF when downloaded

