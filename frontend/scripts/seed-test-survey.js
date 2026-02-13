/**
 * Seeds a test survey, master contact list, and firm-level recipients
 * into the Google Sheet.
 *
 * Run from the frontend/ directory:
 *   node scripts/seed-test-survey.js
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Parse .env.local manually (no dotenv dependency)
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^(\w+)=["']?(.+?)["']?$/);
  if (match) process.env[match[1]] = match[2];
}

const SPREADSHEET_ID = process.env.SURVEY_SHEET_ID;

async function main() {
  if (!SPREADSHEET_ID) {
    console.error('SURVEY_SHEET_ID not set in .env.local');
    process.exit(1);
  }

  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  // 1. Seed the Survey Contacts tab (master contact list)
  console.log('Seeding Survey Contacts tab...');
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Survey Contacts!A:E',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [
        // Header row (only needed if tab is empty)
        ['firm_name', 'contact_name', 'contact_email', 'category', 'active'],
        // Firm with multiple contacts
        ['Test Architecture Firm', 'Jesse Montgomery', 'jlmontie@gmail.com', 'architects', 'TRUE'],
        ['Test Architecture Firm', 'Jane Smith', 'jane@testfirm.com', 'architects', 'TRUE'],
        // Another firm with one contact
        ['Acme Design Group', 'John Doe', 'john@acmedesign.com', 'architects', 'TRUE'],
        // Firm with multiple contacts
        ['Summit Architects', 'Alice Park', 'alice@summitarch.com', 'architects', 'TRUE'],
        ['Summit Architects', 'Bob Chen', 'bob@summitarch.com', 'architects', 'TRUE'],
        ['Summit Architects', 'Carol White', 'carol@summitarch.com', 'architects', 'TRUE'],
        // Inactive contact (should be skipped during import)
        ['Retired Firm LLC', 'Old Timer', 'old@retired.com', 'architects', 'FALSE'],
        // GC category (should not be imported for architects survey)
        ['BuildCo General', 'Mike Builder', 'mike@buildco.com', 'gc', 'TRUE'],
      ],
    },
  });
  console.log('  -> Survey Contacts seeded with test data');

  // 2. Add a test survey
  console.log('Adding test survey...');
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Surveys!A:G',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        'ARCH-2026',
        '2026 Top Utah Architects Survey',
        'architects',
        '2026',
        'May 29, 2026',
        'active',
        'architects',
      ]],
    },
  });
  console.log('  -> Survey ARCH-2026 created');

  // 3. Add a test recipient (firm-level, new column structure)
  //    Columns: recipient_id | survey_id | firm_name | token | status | sent_at | reminded_at | completed_at | draft_data | draft_saved_at
  console.log('Adding test recipient...');
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Survey Recipients!A:J',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        'R-001',
        'ARCH-2026',
        'Test Architecture Firm',
        'test123',
        'pending',
        '',  // sent_at
        '',  // reminded_at
        '',  // completed_at
        '',  // draft_data
        '',  // draft_saved_at
      ]],
    },
  });
  console.log('  -> Recipient R-001 created with token: test123');

  console.log('\nDone! Visit http://localhost:3000/surveys/test123 to test the form.');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
