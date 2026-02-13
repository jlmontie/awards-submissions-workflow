"""
Seeds realistic test survey responses into the Google Sheet for export testing.
Clears existing responses first, then adds firms covering all export cases:
  - Utah firms with revenue (sorted by revenue in export)
  - Utah DND firms (sorted by employee count in export)
  - One out-of-state firm (goes in separate file)

Usage:
    export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
    export SURVEY_SHEET_ID=your_sheet_id
    python seed_test_data.py
"""

import os
import sys

from google.oauth2 import service_account
from googleapiclient.discovery import build

SPREADSHEET_ID = os.environ.get('SURVEY_SHEET_ID')
CREDENTIALS_PATH = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')

# Column headers matching the response route (with state field)
HEADERS = [
    'response_id', 'survey_id', 'recipient_id', 'token', 'submitted_at',
    'firm_name', 'location', 'year_founded', 'top_executive',
    'top_executive_title', 'years_at_firm', 'address', 'city', 'state',
    'zip', 'phone', 'marketing_email', 'website', 'other_locations',
    'num_employees', 'num_licensed_architects', 'num_leed_ap',
    'revenue_current', 'revenue_prior_1', 'revenue_prior_2', 'revenue_dnd',
    'largest_project_completed', 'largest_project_upcoming',
    'pct_k12', 'pct_higher_ed', 'pct_civic', 'pct_healthcare',
    'pct_office', 'pct_resort_hospitality', 'pct_multi_family',
    'pct_commercial_retail', 'pct_sports_rec', 'pct_industrial', 'pct_other',
]

TEST_RESPONSES = [
    # ── Utah firms with revenue (will be sorted by revenue desc) ──
    {
        'response_id': 'SR-2026-001', 'survey_id': 'ARCH-2026',
        'recipient_id': 'R-001', 'token': 'test001',
        'submitted_at': '2026-02-01T10:00:00Z',
        'firm_name': 'Summit Architecture', 'location': 'Salt Lake City',
        'year_founded': '1985', 'top_executive': 'Karen Wells',
        'top_executive_title': 'President', 'years_at_firm': '22',
        'address': '450 S. Main St. #300', 'city': 'Salt Lake City',
        'state': 'UT', 'zip': '84101',
        'phone': '(801) 555-1200', 'marketing_email': 'info@summitarch.com',
        'website': 'www.summitarch.com', 'other_locations': '',
        'num_employees': '95', 'num_licensed_architects': '32',
        'num_leed_ap': '14',
        'revenue_current': '38.2', 'revenue_prior_1': '35.5',
        'revenue_prior_2': '30.1', 'revenue_dnd': 'FALSE',
        'largest_project_completed': 'Wasatch County Courthouse, Heber',
        'largest_project_upcoming': 'Mountain View High School, Orem',
        'pct_k12': '30', 'pct_higher_ed': '25', 'pct_civic': '20',
        'pct_healthcare': '10', 'pct_office': '5',
        'pct_resort_hospitality': '0', 'pct_multi_family': '5',
        'pct_commercial_retail': '5', 'pct_sports_rec': '0',
        'pct_industrial': '0', 'pct_other': '0',
    },
    {
        'response_id': 'SR-2026-002', 'survey_id': 'ARCH-2026',
        'recipient_id': 'R-002', 'token': 'test002',
        'submitted_at': '2026-02-02T14:30:00Z',
        'firm_name': 'Pinnacle Design Group', 'location': 'Provo',
        'year_founded': '2001', 'top_executive': 'Tom Bridger',
        'top_executive_title': 'CEO', 'years_at_firm': '24',
        'address': '1120 N. University Ave.', 'city': 'Provo',
        'state': 'UT', 'zip': '84604',
        'phone': '(801) 555-3400', 'marketing_email': 'tom@pinnacledg.com',
        'website': 'www.pinnacledg.com', 'other_locations': 'Ogden',
        'num_employees': '52', 'num_licensed_architects': '18',
        'num_leed_ap': '7',
        'revenue_current': '21.6', 'revenue_prior_1': '19.8',
        'revenue_prior_2': '22.3', 'revenue_dnd': 'FALSE',
        'largest_project_completed': 'BYU Engineering Building Renovation',
        'largest_project_upcoming': 'Lehi City Rec Center, Lehi',
        'pct_k12': '10', 'pct_higher_ed': '35', 'pct_civic': '25',
        'pct_healthcare': '0', 'pct_office': '10',
        'pct_resort_hospitality': '5', 'pct_multi_family': '10',
        'pct_commercial_retail': '5', 'pct_sports_rec': '0',
        'pct_industrial': '0', 'pct_other': '0',
    },
    {
        'response_id': 'SR-2026-003', 'survey_id': 'ARCH-2026',
        'recipient_id': 'R-003', 'token': 'test003',
        'submitted_at': '2026-02-03T09:15:00Z',
        'firm_name': 'Redrock Studio', 'location': 'St. George',
        'year_founded': '2012', 'top_executive': 'Lisa Navarro',
        'top_executive_title': 'Principal', 'years_at_firm': '13',
        'address': '88 E. St. George Blvd.', 'city': 'St. George',
        'state': 'UT', 'zip': '84770',
        'phone': '(435) 555-7800', 'marketing_email': 'lisa@redrockstudio.com',
        'website': 'www.redrockstudio.com', 'other_locations': '',
        'num_employees': '18', 'num_licensed_architects': '6',
        'num_leed_ap': '2',
        'revenue_current': '4.8', 'revenue_prior_1': '5.1',
        'revenue_prior_2': '3.9', 'revenue_dnd': 'FALSE',
        'largest_project_completed': 'Desert Hills Community Center, St. George',
        'largest_project_upcoming': 'Snow Canyon Visitor Center Expansion',
        'pct_k12': '0', 'pct_higher_ed': '10', 'pct_civic': '30',
        'pct_healthcare': '5', 'pct_office': '0',
        'pct_resort_hospitality': '25', 'pct_multi_family': '20',
        'pct_commercial_retail': '10', 'pct_sports_rec': '0',
        'pct_industrial': '0', 'pct_other': '0',
    },
    {
        'response_id': 'SR-2026-004', 'survey_id': 'ARCH-2026',
        'recipient_id': 'R-004', 'token': 'test004',
        'submitted_at': '2026-02-03T11:00:00Z',
        'firm_name': 'Crestline Architects', 'location': 'Sandy',
        'year_founded': '1998', 'top_executive': 'David Ashworth',
        'top_executive_title': 'President/CEO', 'years_at_firm': '27',
        'address': '9400 S. Granite Peak Dr. #200', 'city': 'Sandy',
        'state': 'UT', 'zip': '84094',
        'phone': '(801) 555-6100', 'marketing_email': 'david@crestlinearch.com',
        'website': 'www.crestlinearch.com', 'other_locations': '',
        'num_employees': '30', 'num_licensed_architects': '10',
        'num_leed_ap': '4',
        'revenue_current': '8.3', 'revenue_prior_1': '7.9',
        'revenue_prior_2': '8.5', 'revenue_dnd': 'FALSE',
        'largest_project_completed': 'Jordan Commons Office Tower Renovation, Sandy',
        'largest_project_upcoming': 'Cottonwood Heights City Hall Expansion',
        'pct_k12': '0', 'pct_higher_ed': '0', 'pct_civic': '15',
        'pct_healthcare': '0', 'pct_office': '35',
        'pct_resort_hospitality': '10', 'pct_multi_family': '25',
        'pct_commercial_retail': '15', 'pct_sports_rec': '0',
        'pct_industrial': '0', 'pct_other': '0',
    },
    # ── Utah DND firms (will be sorted by employee count desc) ──
    {
        'response_id': 'SR-2026-005', 'survey_id': 'ARCH-2026',
        'recipient_id': 'R-005', 'token': 'test005',
        'submitted_at': '2026-02-04T08:00:00Z',
        'firm_name': 'Wasatch Collective', 'location': 'Salt Lake City',
        'year_founded': '2005', 'top_executive': 'Megan Ford',
        'top_executive_title': 'Managing Partner', 'years_at_firm': '20',
        'address': '222 W. 200 S.', 'city': 'Salt Lake City',
        'state': 'UT', 'zip': '84101',
        'phone': '(801) 555-9900', 'marketing_email': 'hello@wasatchcollective.com',
        'website': 'www.wasatchcollective.com', 'other_locations': '',
        'num_employees': '38', 'num_licensed_architects': '12',
        'num_leed_ap': '5',
        'revenue_current': '', 'revenue_prior_1': '',
        'revenue_prior_2': '', 'revenue_dnd': 'TRUE',
        'largest_project_completed': 'Sugar House Mixed-Use Development, SLC',
        'largest_project_upcoming': 'Daybreak Town Center Phase 3, South Jordan',
        'pct_k12': '5', 'pct_higher_ed': '10', 'pct_civic': '15',
        'pct_healthcare': '0', 'pct_office': '10',
        'pct_resort_hospitality': '0', 'pct_multi_family': '45',
        'pct_commercial_retail': '15', 'pct_sports_rec': '0',
        'pct_industrial': '0', 'pct_other': '0',
    },
    {
        'response_id': 'SR-2026-006', 'survey_id': 'ARCH-2026',
        'recipient_id': 'R-006', 'token': 'test006',
        'submitted_at': '2026-02-04T16:45:00Z',
        'firm_name': 'Alpine Drafthouse', 'location': 'Park City',
        'year_founded': '2018', 'top_executive': 'Ryan Kowalski',
        'top_executive_title': 'Founder', 'years_at_firm': '7',
        'address': '1900 Park Ave. #120', 'city': 'Park City',
        'state': 'UT', 'zip': '84060',
        'phone': '(435) 555-2200', 'marketing_email': 'ryan@alpinedrafthouse.com',
        'website': 'www.alpinedrafthouse.com', 'other_locations': '',
        'num_employees': '12', 'num_licensed_architects': '4',
        'num_leed_ap': '3',
        'revenue_current': '', 'revenue_prior_1': '',
        'revenue_prior_2': '', 'revenue_dnd': 'TRUE',
        'largest_project_completed': 'Deer Valley Ski Lodge Renovation',
        'largest_project_upcoming': 'Kimball Junction Mixed-Use, Park City',
        'pct_k12': '0', 'pct_higher_ed': '0', 'pct_civic': '0',
        'pct_healthcare': '0', 'pct_office': '0',
        'pct_resort_hospitality': '60', 'pct_multi_family': '25',
        'pct_commercial_retail': '15', 'pct_sports_rec': '0',
        'pct_industrial': '0', 'pct_other': '0',
    },
    # ── Out-of-state firm (separate file) ──
    {
        'response_id': 'SR-2026-007', 'survey_id': 'ARCH-2026',
        'recipient_id': 'R-007', 'token': 'test007',
        'submitted_at': '2026-02-05T12:00:00Z',
        'firm_name': 'High Plains Design', 'location': 'Boise',
        'year_founded': '1990', 'top_executive': 'Jake Morrison',
        'top_executive_title': 'President', 'years_at_firm': '15',
        'address': '320 W. Idaho St. #400', 'city': 'Boise',
        'state': 'ID', 'zip': '83702',
        'phone': '(208) 555-4400', 'marketing_email': 'jake@highplainsdesign.com',
        'website': 'www.highplainsdesign.com', 'other_locations': '',
        'num_employees': '25', 'num_licensed_architects': '8',
        'num_leed_ap': '3',
        'revenue_current': '12.1', 'revenue_prior_1': '10.8',
        'revenue_prior_2': '11.5', 'revenue_dnd': 'FALSE',
        'largest_project_completed': 'Boise State Student Union Expansion',
        'largest_project_upcoming': 'Idaho Capitol Annex, Boise',
        'pct_k12': '15', 'pct_higher_ed': '30', 'pct_civic': '35',
        'pct_healthcare': '0', 'pct_office': '10',
        'pct_resort_hospitality': '0', 'pct_multi_family': '10',
        'pct_commercial_retail': '0', 'pct_sports_rec': '0',
        'pct_industrial': '0', 'pct_other': '0',
    },
]


def main():
    if not SPREADSHEET_ID or not CREDENTIALS_PATH:
        print('Set SURVEY_SHEET_ID and GOOGLE_APPLICATION_CREDENTIALS')
        sys.exit(1)

    creds = service_account.Credentials.from_service_account_file(
        CREDENTIALS_PATH,
        scopes=['https://www.googleapis.com/auth/spreadsheets'],
    )
    sheets = build('sheets', 'v4', credentials=creds)

    # Clear existing responses
    print('Clearing existing Survey Responses...')
    sheets.spreadsheets().values().clear(
        spreadsheetId=SPREADSHEET_ID,
        range='Survey Responses!A:AZ',
    ).execute()

    # Write header row + test data
    rows = [HEADERS]
    for resp in TEST_RESPONSES:
        rows.append([resp.get(col, '') for col in HEADERS])

    print(f'Writing {len(TEST_RESPONSES)} test responses...')
    sheets.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range='Survey Responses!A1',
        valueInputOption='USER_ENTERED',
        body={'values': rows},
    ).execute()

    print(f'\nSeeded {len(TEST_RESPONSES)} firms:')
    print(f'  4 Utah with revenue (sorted: Summit $38.2M > Pinnacle $21.6M > Crestline $8.3M > Redrock $4.8M)')
    print(f'  2 Utah DND (sorted: Wasatch 38 emp > Alpine 12 emp)')
    print(f'  1 Out-of-state (High Plains, Boise ID)')
    print(f'\nRun the export:')
    print(f'  ~/environments/awards-submissions-workflow/bin/python3 main.py ARCH-2026')


if __name__ == '__main__':
    main()
