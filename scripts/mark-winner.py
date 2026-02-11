#!/usr/bin/env python3
"""
Admin script to mark submissions as winners in Google Sheets.

Usage:
    python mark-winner.py AW-2025-042 "Best Concrete Project"
    python mark-winner.py AW-2025-042 "Best Concrete Project" --notes "Unanimous decision"
    python mark-winner.py AW-2025-042 --unmark  # Remove winner status
    python mark-winner.py --list-pending        # List all pending submissions
    python mark-winner.py --list-winners        # List all winners

This script provides a command-line interface for winner management
until the full admin web dashboard is built in Phase 2.

Requirements:
    - Google Cloud credentials configured
    - Access to the Awards spreadsheet
    - Service account or user OAuth token with Sheets API access
"""

import os
import sys
import argparse
import json
from typing import Optional, List, Dict
from google.oauth2.credentials import Credentials
from google.oauth2 import service_account
from google.cloud import secretmanager
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from datetime import datetime

# Configuration
PROJECT_ID = os.environ.get('GCP_PROJECT_ID', 'your-project-id')
SHEET_ID = os.environ.get('SHEET_ID', None)


def get_secret(secret_id: str) -> str:
    """Retrieve a secret from Secret Manager."""
    client = secretmanager.SecretManagerServiceClient()
    name = f"projects/{PROJECT_ID}/secrets/{secret_id}/versions/latest"
    response = client.access_secret_version(request={"name": name})
    return response.payload.data.decode('UTF-8')


def get_sheets_service():
    """
    Get authenticated Google Sheets service.
    
    Tries to use user OAuth credentials from Secret Manager.
    Falls back to service account if available.
    """
    try:
        # Try user OAuth first (same as Cloud Function)
        secret_name = f"projects/{PROJECT_ID}/secrets/awards-production-user-oauth-token/versions/latest"
        client = secretmanager.SecretManagerServiceClient()
        response = client.access_secret_version(request={"name": secret_name})
        token_data = json.loads(response.payload.data.decode('UTF-8'))
        
        credentials = Credentials(
            token=None,
            refresh_token=token_data['refresh_token'],
            token_uri='https://oauth2.googleapis.com/token',
            client_id=token_data['client_id'],
            client_secret=token_data['client_secret'],
            scopes=['https://www.googleapis.com/auth/spreadsheets'],
            quota_project_id=PROJECT_ID
        )
        
        print("✓ Using user OAuth credentials")
        return build('sheets', 'v4', credentials=credentials)
        
    except Exception as e:
        print(f"⚠ Could not use OAuth credentials: {e}")
        print("✗ Please configure authentication")
        sys.exit(1)


def get_sheet_data(service, sheet_id: str) -> List[List[str]]:
    """
    Retrieve all data from the sheet.
    
    Returns:
        List of rows (each row is a list of values)
    """
    try:
        result = service.spreadsheets().values().get(
            spreadsheetId=sheet_id,
            range='Sheet1!A:ZZ'
        ).execute()
        
        return result.get('values', [])
    
    except HttpError as e:
        print(f"✗ Error reading sheet: {e}")
        sys.exit(1)


def find_submission_row(data: List[List[str]], awards_id: str) -> Optional[int]:
    """
    Find the row number containing the given Awards ID.
    
    Args:
        data: All sheet data
        awards_id: Awards ID to search for (e.g., "AW-2025-042")
    
    Returns:
        Row number (1-indexed) or None if not found
    """
    for i, row in enumerate(data, start=1):
        for cell in row:
            if cell == awards_id:
                return i
    
    return None


def find_column_indices(header_row: List[str]) -> Dict[str, int]:
    """
    Find the column indices for our new fields.
    
    Args:
        header_row: First row of the sheet (headers)
    
    Returns:
        Dictionary mapping field names to column indices
    """
    columns = {}
    
    for i, header in enumerate(header_row):
        if header == 'Awards ID':
            columns['awards_id'] = i
        elif header == 'Status':
            columns['status'] = i
        elif header == 'Winner Category':
            columns['winner_category'] = i
        elif header == 'Winner Notes':
            columns['winner_notes'] = i
    
    return columns


def column_letter(index: int) -> str:
    """
    Convert column index (0-based) to Excel-style letter.
    
    Examples:
        0 → A
        25 → Z
        26 → AA
        51 → AZ
    """
    result = ""
    while index >= 0:
        result = chr(index % 26 + 65) + result
        index = index // 26 - 1
    return result


def mark_as_winner(service, sheet_id: str, awards_id: str, category: str, notes: str = ""):
    """
    Mark a submission as a winner.
    
    Args:
        service: Authenticated Sheets service
        sheet_id: Spreadsheet ID
        awards_id: Awards ID (e.g., "AW-2025-042")
        category: Award category won
        notes: Optional judge notes
    """
    print(f"\n🏆 Marking {awards_id} as winner...")
    
    # Get all data
    data = get_sheet_data(service, sheet_id)
    
    if not data or len(data) < 2:
        print("✗ Sheet is empty or has no data")
        return
    
    # Find column indices
    header_row = data[0]
    columns = find_column_indices(header_row)
    
    if not columns:
        print("✗ Could not find required columns (Awards ID, Status, Winner_Category, Winner_Notes)")
        print("   Please run the schema update first (see SCHEMA_UPDATE_GUIDE.md)")
        return
    
    # Find submission row
    row_num = find_submission_row(data, awards_id)
    
    if not row_num:
        print(f"✗ Submission {awards_id} not found in sheet")
        return
    
    print(f"✓ Found submission at row {row_num}")
    
    # Update Status
    status_col = column_letter(columns['status'])
    status_range = f'Sheet1!{status_col}{row_num}'
    
    service.spreadsheets().values().update(
        spreadsheetId=sheet_id,
        range=status_range,
        valueInputOption='RAW',
        body={'values': [['winner']]}
    ).execute()
    
    print(f"✓ Updated Status to 'winner'")
    
    # Update Winner_Category
    category_col = column_letter(columns['winner_category'])
    category_range = f'Sheet1!{category_col}{row_num}'
    
    service.spreadsheets().values().update(
        spreadsheetId=sheet_id,
        range=category_range,
        valueInputOption='RAW',
        body={'values': [[category]]}
    ).execute()
    
    print(f"✓ Set Winner_Category to '{category}'")
    
    # Update Winner_Notes if provided
    if notes:
        notes_col = column_letter(columns['winner_notes'])
        notes_range = f'Sheet1!{notes_col}{row_num}'
        
        service.spreadsheets().values().update(
            spreadsheetId=sheet_id,
            range=notes_range,
            valueInputOption='RAW',
            body={'values': [[notes]]}
        ).execute()
        
        print(f"✓ Added notes")
    
    print(f"\n✅ Successfully marked {awards_id} as winner!")
    print(f"   Category: {category}")
    if notes:
        print(f"   Notes: {notes}")


def unmark_winner(service, sheet_id: str, awards_id: str):
    """
    Remove winner status from a submission.
    
    Args:
        service: Authenticated Sheets service
        sheet_id: Spreadsheet ID
        awards_id: Awards ID (e.g., "AW-2025-042")
    """
    print(f"\n↩️  Unmarking {awards_id} as winner...")
    
    # Get all data
    data = get_sheet_data(service, sheet_id)
    
    if not data or len(data) < 2:
        print("✗ Sheet is empty or has no data")
        return
    
    # Find column indices
    header_row = data[0]
    columns = find_column_indices(header_row)
    
    if not columns:
        print("✗ Could not find required columns")
        return
    
    # Find submission row
    row_num = find_submission_row(data, awards_id)
    
    if not row_num:
        print(f"✗ Submission {awards_id} not found in sheet")
        return
    
    print(f"✓ Found submission at row {row_num}")
    
    # Update Status to pending
    status_col = column_letter(columns['status'])
    status_range = f'Sheet1!{status_col}{row_num}'
    
    service.spreadsheets().values().update(
        spreadsheetId=sheet_id,
        range=status_range,
        valueInputOption='RAW',
        body={'values': [['pending']]}
    ).execute()
    
    # Clear Winner_Category
    category_col = column_letter(columns['winner_category'])
    category_range = f'Sheet1!{category_col}{row_num}'
    
    service.spreadsheets().values().update(
        spreadsheetId=sheet_id,
        range=category_range,
        valueInputOption='RAW',
        body={'values': [['']]}
    ).execute()
    
    # Clear Winner_Notes
    notes_col = column_letter(columns['winner_notes'])
    notes_range = f'Sheet1!{notes_col}{row_num}'
    
    service.spreadsheets().values().update(
        spreadsheetId=sheet_id,
        range=notes_range,
        valueInputOption='RAW',
        body={'values': [['']]}
    ).execute()
    
    print(f"\n✅ Successfully unmarked {awards_id} as winner (status = pending)")


def list_submissions(service, sheet_id: str, filter_status: Optional[str] = None):
    """
    List all submissions with optional status filter.
    
    Args:
        service: Authenticated Sheets service
        sheet_id: Spreadsheet ID
        filter_status: Optional status to filter by (pending, winner, not_selected)
    """
    # Get all data
    data = get_sheet_data(service, sheet_id)
    
    if not data or len(data) < 2:
        print("✗ Sheet is empty or has no data")
        return
    
    # Find column indices
    header_row = data[0]
    columns = find_column_indices(header_row)
    print(f"columns: {columns}")
    
    if not columns:
        print("✗ Could not find required columns")
        return
    
    # Find Official Name column
    name_col = None
    for i, header in enumerate(header_row):
        if header == 'Official Name':
            name_col = i
            break
    
    print(f"\n{'Awards ID':<15} {'Status':<12} {'Project Name':<40} {'Category'}")
    print("=" * 100)
    
    count = 0
    for row in data[1:]:  # Skip header
        row_awards_id = row[columns['awards_id']] if len(row) > columns['awards_id'] else ''
        row_status = row[columns['status']] if len(row) > columns['status'] else 'pending'
        row_category = row[columns['winner_category']] if len(row) > columns['winner_category'] else ''
        row_name = row[name_col] if name_col and len(row) > name_col else '(unnamed)'
        
        # Apply filter
        if filter_status and row_status != filter_status:
            continue
        
        # Truncate long names
        if len(row_name) > 38:
            row_name = row_name[:35] + '...'
        
        print(f"{row_awards_id:<15} {row_status:<12} {row_name:<40} {row_category}")
        count += 1
    
    print("=" * 100)
    print(f"Total: {count} submission(s)")
    if filter_status:
        print(f"Filter: {filter_status}")


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Mark award submissions as winners",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Mark a submission as winner
  python mark-winner.py AW-2025-042 "Best Concrete Project"
  
  # Mark with notes
  python mark-winner.py AW-2025-042 "Best Concrete Project" --notes "Unanimous decision"
  
  # Remove winner status
  python mark-winner.py AW-2025-042 --unmark
  
  # List all pending submissions
  python mark-winner.py --list-pending
  
  # List all winners
  python mark-winner.py --list-winners
  
  # List all submissions
  python mark-winner.py --list-all
"""
    )
    
    parser.add_argument('awards_id', nargs='?', help='Awards ID (e.g., AW-2025-042)')
    parser.add_argument('category', nargs='?', help='Award category won')
    parser.add_argument('--notes', help='Optional judge notes')
    parser.add_argument('--unmark', action='store_true', help='Remove winner status')
    parser.add_argument('--list-pending', action='store_true', help='List pending submissions')
    parser.add_argument('--list-winners', action='store_true', help='List all winners')
    parser.add_argument('--list-all', action='store_true', help='List all submissions')
    parser.add_argument('--sheet-id', help='Override SHEET_ID environment variable')
    
    args = parser.parse_args()
    
    # Get sheet ID
    sheet_id = args.sheet_id or SHEET_ID
    if not sheet_id:
        try:
            sheet_id = get_secret('awards-production-sheet-id')
        except:
            print("✗ SHEET_ID not provided")
            print("  Set SHEET_ID environment variable or use --sheet-id")
            sys.exit(1)
    
    # Get authenticated service
    service = get_sheets_service()
    
    # Handle list commands
    if args.list_pending:
        list_submissions(service, sheet_id, 'pending')
        return
    
    if args.list_winners:
        list_submissions(service, sheet_id, 'winner')
        return
    
    if args.list_all:
        list_submissions(service, sheet_id)
        return
    
    # Handle mark/unmark commands
    if not args.awards_id:
        parser.print_help()
        sys.exit(1)
    
    if args.unmark:
        unmark_winner(service, sheet_id, args.awards_id)
    else:
        if not args.category:
            print("✗ Category is required when marking as winner")
            print("  Usage: python mark-winner.py AWARDS_ID 'Category'")
            sys.exit(1)
        
        mark_as_winner(service, sheet_id, args.awards_id, args.category, args.notes or "")


if __name__ == '__main__':
    main()


