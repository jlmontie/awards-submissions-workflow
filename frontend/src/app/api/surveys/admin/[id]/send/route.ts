import { NextRequest, NextResponse } from 'next/server';
import { getSheetsClient } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Convert a 0-based column index to a spreadsheet column letter */
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
 * POST /api/surveys/admin/[id]/send
 *
 * Mark selected firms as "sent" and set sent_at timestamp.
 * Body: { recipientIds: string[] } or { all: true }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const surveyId = params.id;
    const body = await request.json();
    const { recipientIds, all } = body;

    if (!all && (!recipientIds || !recipientIds.length)) {
      return NextResponse.json(
        { error: 'Provide recipientIds or set all: true' },
        { status: 400 },
      );
    }

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
    const rows = recipientsRes.data.values || [];
    if (rows.length < 2) {
      return NextResponse.json({ error: 'No recipients found' }, { status: 404 });
    }

    const headers = rows[0];
    const rIdCol = headers.indexOf('recipient_id');
    const rSurveyIdCol = headers.indexOf('survey_id');
    const rStatusCol = headers.indexOf('status');
    const rSentAtCol = headers.indexOf('sent_at');

    const now = new Date().toISOString();
    let updated = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row[rSurveyIdCol] !== surveyId) continue;
      if (!all && !recipientIds.includes(row[rIdCol])) continue;
      if (row[rStatusCol] === 'completed') continue;

      const sheetRow = i + 1; // 1-indexed for Sheets API

      // Update status to "sent" and set sent_at
      const updates: Promise<any>[] = [];

      if (rStatusCol !== -1) {
        updates.push(
          sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `Survey Recipients!${columnLetter(rStatusCol)}${sheetRow}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [['sent']] },
          }),
        );
      }

      if (rSentAtCol !== -1) {
        updates.push(
          sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `Survey Recipients!${columnLetter(rSentAtCol)}${sheetRow}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[now]] },
          }),
        );
      }

      await Promise.all(updates);
      updated++;
    }

    return NextResponse.json({ updated });
  } catch (error: any) {
    console.error('Error marking as sent:', error);
    return NextResponse.json(
      { error: 'Failed to mark as sent' },
      { status: 500 },
    );
  }
}
