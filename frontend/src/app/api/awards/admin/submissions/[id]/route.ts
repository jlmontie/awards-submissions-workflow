import { NextRequest, NextResponse } from 'next/server';
import { getSheetsClient } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function getSheetData() {
  const sheets = await getSheetsClient(true);
  const spreadsheetId = process.env.SHEET_ID;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Sheet1!A:ZZ',
  });

  return response.data.values || [];
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const awardsId = params.id;
    const data = await getSheetData();

    if (data.length < 2) {
      return NextResponse.json({ error: 'No data found' }, { status: 404 });
    }

    const headers = data[0];
    const rows = data.slice(1);

    // Find Awards ID column
    const awardsIdIndex = headers.findIndex((h) => h === 'Awards ID');
    if (awardsIdIndex === -1) {
      return NextResponse.json({ error: 'Awards ID column not found' }, { status: 500 });
    }

    // Find the row with matching Awards ID
    const row = rows.find((r) => r[awardsIdIndex] === awardsId);

    if (!row) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    // Map all fields
    const submission: Record<string, string> = {};
    headers.forEach((header, index) => {
      submission[header] = row[index] || '';
    });

    return NextResponse.json(submission);
  } catch (error: any) {
    console.error('Error fetching submission:', error);
    return NextResponse.json(
      { error: 'Failed to fetch submission' },
      { status: 500 }
    );
  }
}
