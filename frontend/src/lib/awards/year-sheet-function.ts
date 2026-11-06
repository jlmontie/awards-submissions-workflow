import { google } from 'googleapis';
import { AwardYearError, type CreateYearSheet } from './award-years-store';

// The function creates the sheet and copies last year's layout, and may be
// starting cold, so it gets longer than the app's usual Sheets timeout.
const TIMEOUT_MS = 100_000;

/** The account the portal reads Sheets as, which the new sheet is shared with. */
function portalAccount(): string {
  const email = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}').client_email;
  if (!email) throw new AwardYearError('The portal has no service account to share the sheet with.', 500);
  return email;
}

/**
 * Ask the backend to create a year's spreadsheet, and return its ID.
 *
 * The call is authenticated as the Cloud Run service account, the only caller
 * allowed to invoke the function; that is a different account from the one in
 * GOOGLE_SERVICE_ACCOUNT_KEY, so this uses the default credentials.
 */
export const createYearSheet: CreateYearSheet = async (year, sourceSheetId) => {
  const url = process.env.YEAR_SHEET_FUNCTION_URL;
  if (!url) throw new AwardYearError('YEAR_SHEET_FUNCTION_URL is not set.', 500);

  try {
    const client = await new google.auth.GoogleAuth().getIdTokenClient(url);
    const res = await client.request<{ sheet_id: string }>({
      url,
      method: 'POST',
      data: { year, share_with: portalAccount(), source_sheet_id: sourceSheetId },
      timeout: TIMEOUT_MS,
      retry: false,
    });
    return res.data.sheet_id;
  } catch (err: any) {
    if (err instanceof AwardYearError) throw err;
    console.error(`Could not create the ${year} sheet:`, err);
    const reason = err?.response?.data?.error || err?.message || 'unknown error';
    throw new AwardYearError(`Could not create the ${year} sheet: ${reason}`, 502);
  }
};
