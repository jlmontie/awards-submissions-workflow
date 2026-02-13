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

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const surveyId = params.id;
    const body = await request.json();
    const { status } = body;

    if (!status || !['active', 'closed', 'draft'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be active, closed, or draft.' },
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

    // Read surveys to find the row
    const surveysRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Surveys!A:Z',
    });
    const surveyRows = surveysRes.data.values || [];
    if (surveyRows.length < 2) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    const headers = surveyRows[0];
    const sIdCol = headers.indexOf('survey_id');
    const sStatusCol = headers.indexOf('status');

    // Find the row index (1-indexed for Sheets API, +1 for header)
    let rowIndex = -1;
    for (let i = 1; i < surveyRows.length; i++) {
      if (surveyRows[i][sIdCol] === surveyId) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex === -1) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    // Update the status cell
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Surveys!${columnLetter(sStatusCol)}${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[status]],
      },
    });

    return NextResponse.json({ surveyId, status });
  } catch (error: any) {
    console.error('Error updating survey status:', error);
    return NextResponse.json(
      { error: 'Failed to update survey status' },
      { status: 500 },
    );
  }
}
