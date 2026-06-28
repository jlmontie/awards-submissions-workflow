import { NextRequest, NextResponse } from 'next/server';
import { getSheetsClient } from '@/lib/google-sheets';
import {
  responseTabFor,
  SURVEYS_TAB,
  SURVEY_RECIPIENTS_TAB,
  SURVEY_CONTACTS_TAB,
} from '@/lib/surveys/sheets';
import { ARCHITECT_RESPONSE_COLUMNS } from '@/lib/surveys/export/architects';
import { CONTRACTOR_RESPONSE_COLUMNS } from '@/lib/surveys/export/contractors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/surveys/token/[token]
 *
 * Look up a survey recipient by their unique token.
 * Returns survey info + recipient info needed to render the form.
 *
 * Sheets layout:
 *   "Surveys" sheet: survey_id | name | category | year | deadline | status | template_id
 *   "Survey Recipients" sheet: recipient_id | survey_id | firm_name | token | status | sent_at | reminded_at | completed_at | draft_data | draft_saved_at
 *   "Survey Responses - {Template}" sheet: per-template column schema
 */

// Fields that the form sends as booleans and the sheet stores as 'TRUE'/'FALSE'.
// When prefilling an existing submission for editing, these need to be coerced
// back to booleans so the checkbox state restores correctly.
const BOOLEAN_FIELDS = new Set([
  'revenue_dnd',
  'discipline_general_building',
  'discipline_heavy_highway',
  'discipline_municipal_utility',
]);

// Metadata columns that aren't form fields and shouldn't round-trip into the
// edit form's data object.
const METADATA_FIELDS = new Set([
  'response_id',
  'survey_id',
  'recipient_id',
  'token',
  'submitted_at',
  'created_at',
]);

function fallbackColumnsFor(templateId: string): string[] {
  switch (templateId) {
    case 'contractors':
      return CONTRACTOR_RESPONSE_COLUMNS;
    case 'architects':
    default:
      return ARCHITECT_RESPONSE_COLUMNS;
  }
}

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

    // Fetch recipients, surveys, and contacts in parallel. Responses are
    // fetched after we know the templateId so we hit the right per-template tab.
    const [recipientsRes, surveysRes, contactsRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${SURVEY_RECIPIENTS_TAB}!A:Z` }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${SURVEYS_TAB}!A:Z` }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${SURVEY_CONTACTS_TAB}!A:Z` }),
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

    if (surveyRow[sStatusCol] === 'closed') {
      return NextResponse.json(
        { error: 'This survey has been closed.' },
        { status: 410 },
      );
    }

    const surveyCategory = (surveyRow[sCategoryCol] || '').trim().toLowerCase();
    const templateId = surveyRow[templateCol] || 'architects';

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
    // If completed: load from the template-specific response tab (edit mode).
    // Otherwise: load draft_data from the recipient row.
    let prefillData: Record<string, string | boolean> | null = null;
    let prefillSavedAt: string | null = null;

    if (isCompleted) {
      let responseTab: string;
      try {
        responseTab = responseTabFor(templateId);
      } catch {
        // Unknown template — fall through with no prefill
        responseTab = '';
      }

      if (responseTab) {
        const responsesRes = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${responseTab}!A:BZ`,
        });
        const responseRows = responsesRes.data.values || [];
        if (responseRows.length > 0) {
          const hasHeader =
            (responseRows[0][0] || '').trim().toLowerCase() === 'response_id';
          const headers = hasHeader
            ? responseRows[0].map((h) => h.trim().toLowerCase())
            : fallbackColumnsFor(templateId);
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
        templateId,
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
 * Convert a response sheet row back into a form-data object. Coerces known
 * boolean fields back to true/false; other fields pass through as strings.
 */
function responseRowToData(
  headers: string[],
  row: string[],
): Record<string, string | boolean> {
  const data: Record<string, string | boolean> = {};
  for (let i = 0; i < headers.length; i++) {
    const key = headers[i];
    if (!key || METADATA_FIELDS.has(key)) continue;
    const val = row[i] ?? '';
    if (BOOLEAN_FIELDS.has(key)) {
      data[key] = String(val).toUpperCase() === 'TRUE';
    } else {
      data[key] = val;
    }
  }
  return data;
}
