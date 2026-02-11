#!/usr/bin/env python3
"""
Export winner project team information to a separate sheet.

This script extracts team member data from all winning submissions
and creates a formatted "Project Team" sheet for:
- Awards ceremony materials
- Yearbook issue
- Video presentations
- Marketing materials

Usage:
    python export-winners-teams.py
    python export-winners-teams.py --year 2025
    python export-winners-teams.py --output-sheet-id SHEET_ID
    python export-winners-teams.py --dry-run  # Preview without writing

The script will:
1. Find all winners in the main awards sheet
2. Extract team member data from their submissions
3. Create or update a "Project Team YYYY" sheet with formatted data
4. Include all relevant team members and project details

Requirements:
    - Google Cloud credentials configured
    - Access to awards spreadsheet
    - Same authentication as Cloud Functions
"""

import os
import sys
import argparse
import json
from typing import List, Dict, Tuple
from datetime import datetime
from google.oauth2.credentials import Credentials
from google.cloud import secretmanager
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

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
    """Get authenticated Google Sheets service."""
    try:
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
        
        return build('sheets', 'v4', credentials=credentials)
        
    except Exception as e:
        print(f"✗ Could not authenticate: {e}")
        sys.exit(1)


def find_column_indices(header_row: List[str]) -> Dict[str, int]:
    """Find important column indices."""
    columns = {}
    
    # Map exact header names to internal keys
    column_mapping = {
        'Awards ID': 'awards_id',
        'Status': 'status',
        'Winner Category': 'winner_category',
        'Official Name': 'project_name',
        'Location': 'location',
        'Project Category or Categories for Consideration': 'category',
        'Cost': 'cost',
        'Date Completed': 'date_completed',
        'Square Feet': 'square_feet',
        'Owner': 'owner',
        'Owners RepProject Manager': 'owner_rep',
        'Architect': 'architect',
        'General Contractor': 'general_contractor',
        # Add more as needed
    }
    
    for i, header in enumerate(header_row):
        if header in column_mapping:
            columns[column_mapping[header]] = i
        # Store index for any header (for complete access)
        columns[f'_col_{header}'] = i
    
    return columns


def get_winners(service, sheet_id: str, year: str = None) -> List[Tuple[str, List[str]]]:
    """
    Get all winning submissions from the sheet.
    
    Args:
        service: Authenticated Sheets service
        sheet_id: Spreadsheet ID
        year: Optional year filter (e.g., "2025")
    
    Returns:
        List of tuples: (awards_id, row_data)
    """
    print("📊 Reading submissions from sheet...")
    
    result = service.spreadsheets().values().get(
        spreadsheetId=sheet_id,
        range='Sheet1!A:ZZ'
    ).execute()
    
    data = result.get('values', [])
    
    if not data or len(data) < 2:
        print("✗ Sheet is empty or has no data")
        return []
    
    header_row = data[0]
    columns = find_column_indices(header_row)
    
    if 'status' not in columns or 'awards_id' not in columns:
        print("✗ Required columns not found (Awards ID, Status)")
        print("   Please run schema update first")
        return []
    
    # Filter for winners
    winners = []
    for row in data[1:]:  # Skip header
        status = row[columns['status']] if len(row) > columns['status'] else ''
        awards_id = row[columns['awards_id']] if len(row) > columns['awards_id'] else ''
        
        if status == 'winner':
            # Optional year filter
            if year and not awards_id.startswith(f'AW-{year}-'):
                continue
            
            winners.append((awards_id, row))
    
    print(f"✓ Found {len(winners)} winning submissions")
    return winners


def extract_team_data_from_row(row: List[str], header_row: List[str]) -> Dict[str, str]:
    """
    Extract team member data from a submission row.
    
    Args:
        row: Row data from the sheet
        header_row: Header row for column mapping
    
    Returns:
        Dictionary with all team member fields
    """
    # Create a map of header -> value
    row_dict = {}
    for i, header in enumerate(header_row):
        if i < len(row):
            row_dict[header] = row[i]
        else:
            row_dict[header] = ''
    
    return row_dict


def format_team_row(awards_id: str, row_dict: Dict[str, str]) -> List[str]:
    """
    Format a row for the Project Team sheet.
    
    Args:
        awards_id: Awards ID
        row_dict: Dictionary of field_name -> value
    
    Returns:
        List of values in team sheet column order
    """
    return [
        awards_id,
        row_dict.get('Official Name', ''),
        row_dict.get('Location', ''),
        row_dict.get('Winner_Category', ''),
        row_dict.get('Project Category or Categories for Consideration', ''),
        row_dict.get('Cost', ''),
        row_dict.get('Date Completed', ''),
        row_dict.get('Square Feet', ''),
        row_dict.get('LevelsStories 1', ''),
        row_dict.get('Owner', ''),
        row_dict.get('Owners RepProject Manager', ''),
        row_dict.get('Design Team Firm PrincipalinCharge or Proj Mngr', ''),
        row_dict.get('Architect', ''),
        row_dict.get('Civil', ''),
        row_dict.get('Structural', ''),
        row_dict.get('Electrical', ''),
        row_dict.get('Mechanical', ''),
        row_dict.get('Geotech', ''),
        row_dict.get('Interior Design', ''),
        row_dict.get('Landscape Architect', ''),
        row_dict.get('Construction Team Firm Project Manager', ''),
        row_dict.get('General Contractor', ''),
        row_dict.get('Plumbing', ''),
        row_dict.get('HVAC', ''),
        row_dict.get('Electrical_2', ''),
        row_dict.get('Concrete', ''),
        row_dict.get('Steel Fabrication', ''),
        row_dict.get('Steel Erection', ''),
        row_dict.get('GlassCurtain Wall', ''),
        row_dict.get('Masonry', ''),
        row_dict.get('DrywallAcoustics', ''),
        row_dict.get('Painting', ''),
        row_dict.get('TileStone', ''),
        row_dict.get('Carpentry', ''),
        row_dict.get('Flooring', ''),
        row_dict.get('Roofing', ''),
        row_dict.get('Waterproofing', ''),
        row_dict.get('Excavation', ''),
        row_dict.get('Demolition', ''),
        row_dict.get('Precast', ''),
        row_dict.get('Landscaping 1', ''),
        row_dict.get('Name of Firm', ''),
        row_dict.get('Contact Name', ''),
        row_dict.get('Email', ''),
        row_dict.get('Phone 1', ''),
    ]


def create_team_sheet_headers() -> List[str]:
    """Create header row for Project Team sheet."""
    return [
        'Awards ID',
        'Project Name',
        'Location',
        'Award Won',
        'Project Category',
        'Cost',
        'Date Completed',
        'Square Feet',
        'Levels/Stories',
        'Owner',
        "Owner's Rep/PM",
        'Design Team Firm',
        'Architect',
        'Civil Engineer',
        'Structural Engineer',
        'Electrical Engineer',
        'Mechanical Engineer',
        'Geotech',
        'Interior Design',
        'Landscape Architect',
        'Construction Team Firm',
        'General Contractor',
        'Plumbing',
        'HVAC',
        'Electrical (Construction)',
        'Concrete',
        'Steel Fabrication',
        'Steel Erection',
        'Glass/Curtain Wall',
        'Masonry',
        'Drywall/Acoustics',
        'Painting',
        'Tile/Stone',
        'Carpentry',
        'Flooring',
        'Roofing',
        'Waterproofing',
        'Excavation',
        'Demolition',
        'Precast',
        'Landscaping',
        'Submitter Firm',
        'Contact Name',
        'Contact Email',
        'Contact Phone',
    ]


def write_team_sheet(service, sheet_id: str, year: str, team_rows: List[List[str]], dry_run: bool = False):
    """
    Write project team data to a new or existing sheet.
    
    Args:
        service: Authenticated Sheets service
        sheet_id: Spreadsheet ID
        year: Year for sheet name
        team_rows: List of formatted rows
        dry_run: If True, just print what would be written
    """
    sheet_name = f"Project Team {year}"
    
    # Prepare data with headers
    headers = create_team_sheet_headers()
    all_data = [headers] + team_rows
    
    if dry_run:
        print(f"\n🔍 DRY RUN - Would write to '{sheet_name}':")
        print(f"   {len(team_rows)} winner rows")
        print(f"   {len(headers)} columns")
        print("\nSample row:")
        if team_rows:
            sample = team_rows[0]
            for i, header in enumerate(headers[:10]):  # Show first 10 fields
                print(f"   {header}: {sample[i] if i < len(sample) else ''}")
            print("   ...")
        return
    
    print(f"\n✍️  Writing to sheet '{sheet_name}'...")
    
    try:
        # Check if sheet exists
        spreadsheet = service.spreadsheets().get(spreadsheetId=sheet_id).execute()
        sheets = spreadsheet.get('sheets', [])
        
        sheet_exists = any(s['properties']['title'] == sheet_name for s in sheets)
        
        if sheet_exists:
            print(f"✓ Sheet '{sheet_name}' exists, will update")
            # Clear existing data
            service.spreadsheets().values().clear(
                spreadsheetId=sheet_id,
                range=f"'{sheet_name}'!A:ZZ"
            ).execute()
        else:
            print(f"✓ Creating new sheet '{sheet_name}'")
            # Create new sheet
            request_body = {
                'requests': [{
                    'addSheet': {
                        'properties': {
                            'title': sheet_name
                        }
                    }
                }]
            }
            service.spreadsheets().batchUpdate(
                spreadsheetId=sheet_id,
                body=request_body
            ).execute()
        
        # Write data
        body = {
            'values': all_data
        }
        
        result = service.spreadsheets().values().update(
            spreadsheetId=sheet_id,
            range=f"'{sheet_name}'!A1",
            valueInputOption='RAW',
            body=body
        ).execute()
        
        print(f"✅ Successfully wrote {len(team_rows)} winner teams to '{sheet_name}'")
        print(f"   Updated {result.get('updatedCells', 0)} cells")
        
    except HttpError as e:
        print(f"✗ Error writing to sheet: {e}")
        sys.exit(1)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Export winner project teams to a separate sheet",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    parser.add_argument('--year', help='Filter by year (e.g., 2025)')
    parser.add_argument('--sheet-id', help='Source sheet ID')
    parser.add_argument('--output-sheet-id', help='Output sheet ID (defaults to same as source)')
    parser.add_argument('--dry-run', action='store_true', help='Preview without writing')
    
    args = parser.parse_args()
    
    # Get sheet ID
    sheet_id = args.sheet_id or SHEET_ID
    if not sheet_id:
        try:
            sheet_id = get_secret('awards-production-sheet-id')
        except:
            print("✗ SHEET_ID not provided")
            sys.exit(1)
    
    # Output sheet defaults to same as source
    output_sheet_id = args.output_sheet_id or sheet_id
    
    # Determine year
    year = args.year or str(datetime.now().year)
    
    print(f"🏆 Exporting Winner Project Teams for {year}")
    print("=" * 60)
    
    # Get authenticated service
    service = get_sheets_service()
    
    # Get winners
    winners = get_winners(service, sheet_id, year)
    
    if not winners:
        print("\n⚠️  No winners found")
        if not args.year:
            print("   Try specifying a year: --year 2025")
        sys.exit(0)
    
    # Get header row for column mapping
    result = service.spreadsheets().values().get(
        spreadsheetId=sheet_id,
        range='Sheet1!1:1'
    ).execute()
    header_row = result.get('values', [[]])[0]
    
    # Format team data
    print("\n📋 Formatting team data...")
    team_rows = []
    for awards_id, row in winners:
        row_dict = extract_team_data_from_row(row, header_row)
        team_row = format_team_row(awards_id, row_dict)
        team_rows.append(team_row)
    
    print(f"✓ Formatted {len(team_rows)} team rows")
    
    # Write to sheet
    write_team_sheet(service, output_sheet_id, year, team_rows, args.dry_run)
    
    if not args.dry_run:
        print(f"\n✅ Export complete!")
        print(f"   View at: https://docs.google.com/spreadsheets/d/{output_sheet_id}")


if __name__ == '__main__':
    main()


