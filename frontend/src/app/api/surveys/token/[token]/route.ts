import { NextRequest, NextResponse } from 'next/server';
import { getSheetsClient } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Canonical column order for "Survey Responses". Mirrors RESPONSE_COLUMNS in
// the export route and the order written by /api/surveys/responses (POST).
// Used as a fallback when the sheet has no header row.
const RESPONSE_COLUMNS = [
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
  'other_segment_name',
];

/**
 * GET /api/surveys/token/[token]
 *
 * Look up a survey recipient by their unique token.
 * Returns survey info + recipient info needed to render the form.
 *
 * Sheets layout:
 *   "Surveys" sheet: survey_id | name | category | year | deadline | status | template_id
 *   "Survey Recipients" sheet: recipient_id | survey_id | firm_name | token | status | sent_at | reminded_at | completed_at
 */

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    const token = params.token;
    const spreadsheetId = process.env.SURVEY_SHEET_ID;

    if (!spreadsheetId) {
      return NextResponse.json(
        { error: 'Survey system not configured' },
        { status: 500 },
      );
    }

    const sheets = await getSheetsClient(true);

    // Fetch recipients, surveys, contacts, and responses in parallel
    const [recipientsRes, surveysRes, contactsRes, responsesRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId, range: 'Survey Recipients!A:Z' }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: 'Surveys!A:Z' }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: 'Survey Contacts!A:Z' }),
      // A:AZ matches the export route's range — Survey Responses has ~39
      // columns (through AM), so A:Z (26 cols) would silently drop the
      // Projects and Market Segments fields starting at column AA.
      sheets.spreadsheets.values.get({ spreadsheetId, range: 'Survey Responses!A:AZ' }),
    ]);

    const recipientRows = recipientsRes.data.values || [];
    if (recipientRows.length < 2) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    const recipientHeaders = recipientRows[0];
    const tokenCol = recipientHeaders.indexOf('token');
    const surveyIdCol = recipientHeaders.indexOf('survey_id');
    const recipientIdCol = recipientHeaders.indexOf('recipient_id');
    const firmNameCol = recipientHeaders.indexOf('firm_name');
    const statusCol = recipientHeaders.indexOf('status');
    const draftDataCol = recipientHeaders.indexOf('draft_data');
    const draftSavedAtCol = recipientHeaders.indexOf('draft_saved_at');

    if (tokenCol === -1) {
      return NextResponse.json({ error: 'Invalid sheet configuration' }, { status: 500 });
    }

    // Find recipient by token
    const recipientRow = recipientRows.slice(1).find((row) => row[tokenCol] === token);
    if (!recipientRow) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    const surveyId = recipientRow[surveyIdCol];
    const recipientId = recipientRow[recipientIdCol] || '';
    const firmName = (recipientRow[firmNameCol] || '').trim();
    const isCompleted = recipientRow[statusCol] === 'completed';

    // --- Survey metadata ---
    const surveyRows = surveysRes.data.values || [];
    if (surveyRows.length < 2) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    const surveyHeaders = surveyRows[0];
    const sIdCol = surveyHeaders.indexOf('survey_id');
    const nameCol = surveyHeaders.indexOf('name');
    const sCategoryCol = surveyHeaders.indexOf('category');
    const yearCol = surveyHeaders.indexOf('year');
    const deadlineCol = surveyHeaders.indexOf('deadline');
    const sStatusCol = surveyHeaders.indexOf('status');
    const templateCol = surveyHeaders.indexOf('template_id');

    const surveyRow = surveyRows.slice(1).find((row) => row[sIdCol] === surveyId);
    if (!surveyRow) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    // Check survey is active
    if (surveyRow[sStatusCol] === 'closed') {
      return NextResponse.json(
        { error: 'This survey has been closed.' },
        { status: 410 },
      );
    }

    const surveyCategory = (surveyRow[sCategoryCol] || '').trim().toLowerCase();

    // --- Firm collaborators (active contacts in this firm + category) ---
    const contactRows = contactsRes.data.values || [];
    const collaborators: { name: string; email: string }[] = [];

    if (contactRows.length >= 2 && firmName) {
      const cHeaders = contactRows[0];
      const cFirmCol = cHeaders.indexOf('firm_name');
      const cNameCol = cHeaders.indexOf('contact_name');
      const cEmailCol = cHeaders.indexOf('contact_email');
      const cCategoryCol = cHeaders.indexOf('category');
      const cActiveCol = cHeaders.indexOf('active');

      for (let i = 1; i < contactRows.length; i++) {
        const row = contactRows[i];
        const rowFirm = (row[cFirmCol] || '').trim();
        const rowCategory = (row[cCategoryCol] || '').trim().toLowerCase();
        const active = (row[cActiveCol] || '').trim().toUpperCase();
        if (rowFirm === firmName && rowCategory === surveyCategory && active === 'TRUE') {
          collaborators.push({
            name: row[cNameCol] || '',
            email: row[cEmailCol] || '',
          });
        }
      }
    }

    // --- Determine prefill data ---
    // If completed: load from Survey Responses (edit mode).
    // Otherwise: load draft_data from the recipient row.
    let prefillData: Record<string, string | boolean> | null = null;
    let prefillSavedAt: string | null = null;

    if (isCompleted) {
      const responseRows = responsesRes.data.values || [];
      if (responseRows.length > 0) {
        // The sheet may or may not have a header row. Detect by checking A1.
        const hasHeader =
          (responseRows[0][0] || '').trim().toLowerCase() === 'response_id';
        const headers = hasHeader
          ? responseRows[0].map((h) => h.trim().toLowerCase())
          : RESPONSE_COLUMNS;
        const dataRows = hasHeader ? responseRows.slice(1) : responseRows;

        const respRecipientCol = headers.indexOf('recipient_id');
        const respSubmittedAtCol = headers.indexOf('submitted_at');
        if (respRecipientCol !== -1) {
          const responseRow = dataRows.find(
            (row) => row[respRecipientCol] === recipientId,
          );
          if (responseRow) {
            prefillData = responseRowToData(headers, responseRow);
            prefillSavedAt =
              respSubmittedAtCol !== -1 ? responseRow[respSubmittedAtCol] || null : null;
          }
        }
      }
    } else {
      if (draftDataCol !== -1 && recipientRow[draftDataCol]) {
        try {
          prefillData = JSON.parse(recipientRow[draftDataCol]);
        } catch {
          // Ignore corrupt draft data
        }
      }
      prefillSavedAt =
        draftSavedAtCol !== -1 ? recipientRow[draftSavedAtCol] || null : null;
    }

    return NextResponse.json({
      survey: {
        surveyId: surveyRow[sIdCol] || '',
        name: surveyRow[nameCol] || '',
        year: parseInt(surveyRow[yearCol] || new Date().getFullYear().toString(), 10),
        deadline: surveyRow[deadlineCol] || '',
        templateId: surveyRow[templateCol] || 'architects',
      },
      recipient: {
        firmName,
        draftData: prefillData,
        draftSavedAt: prefillSavedAt,
        isCompleted,
        collaborators,
      },
    });
  } catch (error: any) {
    console.error('Error looking up survey token:', error);
    return NextResponse.json(
      { error: 'Failed to load survey' },
      { status: 500 },
    );
  }
}

/**
 * Convert a Survey Responses sheet row back into a form-data object,
 * coercing the DND checkbox value back to a boolean.
 */
function responseRowToData(
  headers: string[],
  row: string[],
): Record<string, string | boolean> {
  const data: Record<string, string | boolean> = {};
  // Metadata columns are not form fields and should not be copied into data.
  const skip = new Set([
    'response_id',
    'survey_id',
    'recipient_id',
    'token',
    'submitted_at',
    'created_at',
  ]);
  for (let i = 0; i < headers.length; i++) {
    const key = headers[i];
    if (!key || skip.has(key)) continue;
    const val = row[i] ?? '';
    if (key === 'revenue_dnd') {
      data[key] = String(val).toUpperCase() === 'TRUE';
    } else {
      data[key] = val;
    }
  }
  return data;
}
