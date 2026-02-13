import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

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

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

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

    // Check for duplicate submission
    if (recipientRow[statusCol] === 'completed') {
      return NextResponse.json(
        { error: 'You have already submitted a response.' },
        { status: 409 },
      );
    }

    const surveyId = recipientRow[surveyIdCol];
    const recipientId = recipientRow[recipientIdCol];
    const now = new Date().toISOString();

    // 2. Generate response ID
    // Count existing responses to generate sequential ID
    const responsesRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Survey Responses!A:A',
    });
    const existingResponses = (responsesRes.data.values || []).length;
    const responseId = `SR-${new Date().getFullYear()}-${String(existingResponses).padStart(3, '0')}`;

    // 3. Write response row
    // Column order matches the plan's response sheet structure
    const responseRow = [
      responseId,
      surveyId,
      recipientId,
      token,
      now,
      data.firm_name || '',
      data.location || '',
      data.year_founded || '',
      data.top_executive || '',
      data.top_executive_title || '',
      data.years_at_firm || '',
      data.address || '',
      data.city || '',
      data.state || '',
      data.zip || '',
      data.phone || '',
      data.marketing_email || '',
      data.website || '',
      data.other_locations || '',
      data.num_employees || '',
      data.num_licensed_architects || '',
      data.num_leed_ap || '',
      data.revenue_current || '',
      data.revenue_prior_1 || '',
      data.revenue_prior_2 || '',
      data.revenue_dnd ? 'TRUE' : 'FALSE',
      data.largest_project_completed || '',
      data.largest_project_upcoming || '',
      data.pct_k12 || '',
      data.pct_higher_ed || '',
      data.pct_civic || '',
      data.pct_healthcare || '',
      data.pct_office || '',
      data.pct_resort_hospitality || '',
      data.pct_multi_family || '',
      data.pct_commercial_retail || '',
      data.pct_sports_rec || '',
      data.pct_industrial || '',
      data.pct_other || '',
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Survey Responses!A:Z',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [responseRow],
      },
    });

    // 4. Update recipient status to "completed"
    if (statusCol !== -1) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Survey Recipients!${columnLetter(statusCol)}${recipientRowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['completed']],
        },
      });

      // Also update completed_at if column exists
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

    return NextResponse.json({ responseId });
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
