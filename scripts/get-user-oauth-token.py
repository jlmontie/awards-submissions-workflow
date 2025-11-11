#!/usr/bin/env python3
"""
Helper script to generate OAuth refresh token for Google Drive/Sheets access.
This token will be stored in Secret Manager and used by Cloud Functions.
"""

from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
import json

# Scopes needed
SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/spreadsheets'
]

def main():
    print("=" * 70)
    print("Google Drive/Sheets OAuth Token Generator")
    print("=" * 70)
    print()
    print("This will open a browser window to authenticate with Google.")
    print("Please sign in with the account that owns the Drive folder.")
    print()

    # You'll need to create OAuth credentials in Google Cloud Console
    # Go to: APIs & Services > Credentials > Create OAuth Client ID
    # Type: Desktop application

    client_config = {
        "installed": {
            "client_id": input("Enter OAuth Client ID: "),
            "client_secret": input("Enter OAuth Client Secret: "),
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": ["http://localhost"]
        }
    }

    flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
    creds = flow.run_local_server(port=0)

    print()
    print("=" * 70)
    print("SUCCESS! Your OAuth token has been generated.")
    print("=" * 70)
    print()

    token_data = {
        'refresh_token': creds.refresh_token,
        'token_uri': creds.token_uri,
        'client_id': creds.client_id,
        'client_secret': creds.client_secret,
        'scopes': creds.scopes
    }

    print("Token data (save this):")
    print(json.dumps(token_data, indent=2))
    print()

    # Save to file
    with open('/tmp/user-oauth-token.json', 'w') as f:
        json.dump(token_data, f, indent=2)

    print("Token saved to: /tmp/user-oauth-token.json")
    print()
    print("Now run:")
    print("  gcloud secrets create awards-production-user-oauth-token \\")
    print("    --data-file=/tmp/user-oauth-token.json \\")
    print("    --project=utah-construction-and-design")
    print()
    print("Then delete the local file:")
    print("  rm /tmp/user-oauth-token.json")

if __name__ == '__main__':
    main()
