import { google } from 'googleapis';

/**
 * Create an authenticated Google Sheets client.
 *
 * Credentials resolution order:
 *   1. GOOGLE_SERVICE_ACCOUNT_KEY env var (JSON string — works on Vercel/serverless)
 *   2. GOOGLE_APPLICATION_CREDENTIALS env var (file path — local dev fallback)
 *
 * @param readonly - if true, requests readonly scope; otherwise full read/write
 */
export async function getSheetsClient(readonly = false) {
  const scope = readonly
    ? 'https://www.googleapis.com/auth/spreadsheets.readonly'
    : 'https://www.googleapis.com/auth/spreadsheets';

  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  let auth;
  if (keyJson) {
    const credentials = JSON.parse(keyJson);
    auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [scope],
    });
  } else {
    // Falls back to GOOGLE_APPLICATION_CREDENTIALS file path or ADC
    auth = new google.auth.GoogleAuth({
      scopes: [scope],
    });
  }

  return google.sheets({ version: 'v4', auth });
}
