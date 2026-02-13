import { NextRequest, NextResponse } from 'next/server';
import { getSheetsClient } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * PUT /api/surveys/responses/draft
 *
 * Save draft survey data without submitting.
 *
 * Body: { token: string, data: Record<string, string | boolean> }
 *
 * Stores a JSON blob in the "draft_data" column and updates
 * "draft_saved_at". Transitions status from "pending" to "in_progress"
 * on first save.
 */

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

export async function PUT(request: NextRequest) {
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
    const statusCol = recipientHeaders.indexOf('status');
    const draftDataCol = recipientHeaders.indexOf('draft_data');
    const draftSavedAtCol = recipientHeaders.indexOf('draft_saved_at');

    if (tokenCol === -1) {
      return NextResponse.json({ error: 'Invalid sheet configuration' }, { status: 500 });
    }

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

    // Reject if already completed
    if (recipientRow[statusCol] === 'completed') {
      return NextResponse.json(
        { error: 'Survey has already been submitted.' },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();

    // 2. Write draft_data
    if (draftDataCol !== -1) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Survey Recipients!${columnLetter(draftDataCol)}${recipientRowIndex}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[JSON.stringify(data)]],
        },
      });
    }

    // 3. Write draft_saved_at
    if (draftSavedAtCol !== -1) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Survey Recipients!${columnLetter(draftSavedAtCol)}${recipientRowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[now]],
        },
      });
    }

    // 4. Transition status from "pending" to "in_progress" on first save
    if (statusCol !== -1 && recipientRow[statusCol] === 'pending') {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Survey Recipients!${columnLetter(statusCol)}${recipientRowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['in_progress']],
        },
      });
    }

    return NextResponse.json({ saved: true, savedAt: now });
  } catch (error: any) {
    console.error('Error saving survey draft:', error);
    return NextResponse.json(
      { error: 'Failed to save draft' },
      { status: 500 },
    );
  }
}
