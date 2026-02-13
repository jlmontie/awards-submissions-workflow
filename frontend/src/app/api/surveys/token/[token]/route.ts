import { NextRequest, NextResponse } from 'next/server';
import { getSheetsClient } from '@/lib/google-sheets';

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

    // Fetch recipients sheet
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

    // Check if already completed
    if (recipientRow[statusCol] === 'completed') {
      return NextResponse.json(
        { error: 'You have already submitted a response to this survey.' },
        { status: 409 },
      );
    }

    const surveyId = recipientRow[surveyIdCol];

    // Fetch surveys sheet
    const surveysRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Surveys!A:Z',
    });
    const surveyRows = surveysRes.data.values || [];
    if (surveyRows.length < 2) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    const surveyHeaders = surveyRows[0];
    const sIdCol = surveyHeaders.indexOf('survey_id');
    const nameCol = surveyHeaders.indexOf('name');
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

    // Parse draft data safely
    let draftData: Record<string, string | boolean> | null = null;
    if (draftDataCol !== -1 && recipientRow[draftDataCol]) {
      try {
        draftData = JSON.parse(recipientRow[draftDataCol]);
      } catch {
        // Ignore corrupt draft data
      }
    }
    const draftSavedAt =
      draftSavedAtCol !== -1 ? recipientRow[draftSavedAtCol] || null : null;

    return NextResponse.json({
      survey: {
        surveyId: surveyRow[sIdCol] || '',
        name: surveyRow[nameCol] || '',
        year: parseInt(surveyRow[yearCol] || new Date().getFullYear().toString(), 10),
        deadline: surveyRow[deadlineCol] || '',
        templateId: surveyRow[templateCol] || 'architects',
      },
      recipient: {
        firmName: recipientRow[firmNameCol] || '',
        draftData,
        draftSavedAt,
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
