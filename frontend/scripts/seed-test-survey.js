/**
 * Seeds a test survey and recipient into the Google Sheet.
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

  // 1. Add a test survey
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

  // 2. Add a test recipient with a known token
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
        'Jesse Montgomery',
        'jlmontie@gmail.com',
        'test123',
        'pending',
        '',
        '',
        '0',
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
