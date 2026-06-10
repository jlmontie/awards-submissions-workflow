import { NextRequest, NextResponse } from 'next/server';
import { getSheetsClient } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function columnLetter(index: number): string {
  let letter = '';
  let i = index;
  while (i >= 0) {
    letter = String.fromCharCode((i % 26) + 65) + letter;
    i = Math.floor(i / 26) - 1;
  }
  return letter;
}

/**
 * PUT /api/surveys/admin/[id]/recipient/[recipientId]/notes
 *
 * Save the admin's free-form notes for a single firm/recipient. Notes live
 * in the `notes` column of "Survey Recipients" — added lazily here if the
 * column doesn't exist yet, so we don't need a schema migration step.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; recipientId: string } },
) {
  try {
    const { id: surveyId, recipientId } = params;
    const body = await request.json();
    const notes = String(body?.notes ?? '');

    const spreadsheetId = process.env.SURVEY_SHEET_ID;
    if (!spreadsheetId) {
      return NextResponse.json(
        { error: 'Survey system not configured' },
        { status: 500 },
      );
    }

    const sheets = await getSheetsClient();

    const recipientsRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Survey Recipients!A:Z',
    });
    const recipientRows = recipientsRes.data.values || [];
    if (recipientRows.length < 2) {
      return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
    }
    const headers = recipientRows[0];
    const rIdCol = headers.indexOf('recipient_id');
    const rSurveyIdCol = headers.indexOf('survey_id');
    let notesCol = headers.indexOf('notes');

    // Find target row
    let rowIndex = -1;
    for (let i = 1; i < recipientRows.length; i++) {
      const row = recipientRows[i];
      if (row[rIdCol] === recipientId && row[rSurveyIdCol] === surveyId) {
        rowIndex = i + 1;
        break;
      }
    }
    if (rowIndex === -1) {
      return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
    }

    // Lazily add a `notes` header column if the sheet doesn't have one yet.
    if (notesCol === -1) {
      notesCol = headers.length;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Survey Recipients!${columnLetter(notesCol)}1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['notes']] },
      });
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Survey Recipients!${columnLetter(notesCol)}${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[notes]] },
    });

    return NextResponse.json({ saved: true });
  } catch (error: any) {
    console.error('Error saving recipient notes:', error);
    return NextResponse.json(
      { error: 'Failed to save notes' },
      { status: 500 },
    );
  }
}
