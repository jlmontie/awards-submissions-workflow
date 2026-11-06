import { NextRequest, NextResponse } from 'next/server';
import { getSheetsClient } from '@/lib/google-sheets';
import { filterValuesByYear, isWinner } from '@/lib/awards/sheet-rows';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function getSheetData() {
  const sheets = await getSheetsClient(true);
  const spreadsheetId = process.env.AWARDS_SHEET_ID;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Sheet1!A:ZZ',
  });

  return response.data.values || [];
}

export async function GET(request: NextRequest) {
  try {
    const data = filterValuesByYear(await getSheetData(), request.nextUrl.searchParams.get('year'));

    if (data.length < 2) {
      return NextResponse.json({
        total: 0,
        winners: 0,
      });
    }

    const headers = data[0];
    const rows = data.slice(1);

    const winnerCategoryIndex = headers.findIndex((h) => h === 'Winner Category');

    return NextResponse.json({
      total: rows.length,
      winners: rows.filter((row) => isWinner(row[winnerCategoryIndex])).length,
    });
  } catch (error: any) {
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
