import { NextRequest, NextResponse } from 'next/server';
import { getSheetsClient } from '@/lib/google-sheets';
import { surveyTemplates, normalizeSubmission } from '@/lib/surveys/templates';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/surveys/responses
 *
 * Submit a survey response.
 *
 * Body: { token: string, data: Record<string, string | boolean> }
 *
 * Writes a row to the "Survey Responses" sheet and updates the
 * recipient status to "completed" in "Survey Recipients".
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, data } = body;

    if (!token || !data) {
      return NextResponse.json({ error: 'Missing token or data' }, { status: 400 });
    }

    const spreadsheetId = process.env.SURVEY_SHEET_ID;
    if (!spreadsheetId) {
      return NextResponse.json({ error: 'Survey system not configured' }, { status: 500 });
    }

    const sheets = await getSheetsClient();

    // 1. Look up recipient by token
    const recipientsRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Survey Recipients!A:Z',
    });
    const recipientRows = recipientsRes.data.values || [];
    if (recipientRows.length < 2) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    const recipientHeaders = recipientRows[0];
    const tokenCol = recipientHeaders.indexOf('token');
    const surveyIdCol = recipientHeaders.indexOf('survey_id');
    const recipientIdCol = recipientHeaders.indexOf('recipient_id');
    const statusCol = recipientHeaders.indexOf('status');

    // Find recipient row index (1-indexed, +1 for header)
    let recipientRowIndex = -1;
    let recipientRow: string[] | null = null;
    for (let i = 1; i < recipientRows.length; i++) {
      if (recipientRows[i][tokenCol] === token) {
        recipientRowIndex = i + 1; // 1-indexed for Sheets API
        recipientRow = recipientRows[i];
        break;
      }
    }

    if (!recipientRow) {
      return NextResponse.json({ error: 'Invalid survey link' }, { status: 404 });
    }

    const isEditingExisting = recipientRow[statusCol] === 'completed';

    const surveyId = recipientRow[surveyIdCol];
    const recipientId = recipientRow[recipientIdCol];
    const now = new Date().toISOString();

    // Resolve the survey's template so we can normalize submission values
    // (e.g. 'Utah' → 'UT' on the state field). Falls through with no
    // normalization if the survey or template can't be resolved — we'd
    // rather write the submission than block on a template lookup.
    const surveysRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Surveys!A:Z',
    });
    const surveyRows = surveysRes.data.values || [];
    let normalized: Record<string, unknown> = data;
    if (surveyRows.length >= 2) {
      const sHeaders = surveyRows[0];
      const sIdCol = sHeaders.indexOf('survey_id');
      const sTemplateCol = sHeaders.indexOf('template_id');
      const surveyRow = surveyRows.slice(1).find((r) => r[sIdCol] === surveyId);
      const templateId = surveyRow && sTemplateCol !== -1 ? surveyRow[sTemplateCol] : '';
      const template = templateId ? surveyTemplates[templateId] : undefined;
      if (template) {
        normalized = normalizeSubmission(template, data);
      }
    }

    // Look up existing response for this recipient (if any) so we can overwrite in place.
    // A:AZ to cover the full response schema (~39 columns through AM).
    const responsesRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Survey Responses!A:AZ',
    });
    const responseRows = responsesRes.data.values || [];
    let existingResponseRowIndex = -1;
    let existingResponseId = '';

    if (responseRows.length >= 2) {
      const respHeaders = responseRows[0];
      const respRecipientCol = respHeaders.indexOf('recipient_id');
      const respIdCol = respHeaders.indexOf('response_id');
      if (respRecipientCol !== -1) {
        for (let i = 1; i < responseRows.length; i++) {
          if (responseRows[i][respRecipientCol] === recipientId) {
            existingResponseRowIndex = i + 1; // 1-indexed
            existingResponseId = respIdCol !== -1 ? responseRows[i][respIdCol] || '' : '';
            break;
          }
        }
      }
    }

    // Generate / reuse response ID
    const responseId =
      existingResponseId ||
      `SR-${new Date().getFullYear()}-${String(responseRows.length).padStart(3, '0')}`;

    // 3. Build response row from the normalized data
    // Column order matches the plan's response sheet structure
    const d = normalized;
    const responseRow = [
      responseId,
      surveyId,
      recipientId,
      token,
      now,
      d.firm_name || '',
      d.location || '',
      d.year_founded || '',
      d.top_executive || '',
      d.top_executive_title || '',
      d.years_at_firm || '',
      d.address || '',
      d.city || '',
      d.state || '',
      d.zip || '',
      d.phone || '',
      d.marketing_email || '',
      d.website || '',
      d.other_locations || '',
      d.num_employees || '',
      d.num_licensed_architects || '',
      d.num_leed_ap || '',
      d.revenue_current || '',
      d.revenue_prior_1 || '',
      d.revenue_prior_2 || '',
      d.revenue_dnd ? 'TRUE' : 'FALSE',
      d.largest_project_completed || '',
      d.largest_project_completed_location || '',
      d.largest_project_upcoming || '',
      d.largest_project_upcoming_location || '',
      d.pct_k12 || '',
      d.pct_higher_ed || '',
      d.pct_civic || '',
      d.pct_healthcare || '',
      d.pct_office || '',
      d.pct_resort_hospitality || '',
      d.pct_multi_family || '',
      d.pct_commercial_retail || '',
      d.pct_sports_rec || '',
      d.pct_industrial || '',
      d.pct_other || '',
      // New column appended at the end of the schema (see RESPONSE_COLUMNS in
      // export/route.ts and token/[token]/route.ts). Keeps existing column
      // positions stable so historical Sheet data doesn't need to migrate.
      d.other_segment_name || '',
    ];

    if (existingResponseRowIndex !== -1) {
      // Editing an existing submission: overwrite the row in place.
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Survey Responses!A${existingResponseRowIndex}:${columnLetter(responseRow.length - 1)}${existingResponseRowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [responseRow] },
      });
    } else {
      // First submission: append a new row.
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Survey Responses!A:AZ',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [responseRow] },
      });
    }

    // 4. Update recipient status to "completed" (and completed_at on first submit)
    if (statusCol !== -1) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Survey Recipients!${columnLetter(statusCol)}${recipientRowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['completed']],
        },
      });

      // Only stamp completed_at on the FIRST submission — preserve original timestamp on edits.
      if (!isEditingExisting) {
        const completedAtCol = recipientHeaders.indexOf('completed_at');
        if (completedAtCol !== -1) {
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `Survey Recipients!${columnLetter(completedAtCol)}${recipientRowIndex}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
              values: [[now]],
            },
          });
        }
      }
    }

    return NextResponse.json({ responseId, edited: isEditingExisting });
  } catch (error: any) {
    console.error('Error submitting survey response:', error);
    return NextResponse.json(
      { error: 'Failed to submit survey response' },
      { status: 500 },
    );
  }
}

/** Convert a 0-based column index to a spreadsheet column letter (A, B, ... Z, AA, ...) */
function columnLetter(index: number): string {
  let letter = '';
  let i = index;
  while (i >= 0) {
    letter = String.fromCharCode((i % 26) + 65) + letter;
    i = Math.floor(i / 26) - 1;
  }
  return letter;
}
