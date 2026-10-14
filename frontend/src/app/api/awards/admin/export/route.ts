import { NextResponse } from 'next/server';
import { getSheetsClient } from '@/lib/google-sheets';
import { buildCategoryExport, buildCategoryWorkbook } from '@/lib/awards/category-export';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Admin-only through the /api/awards/admin/:path* middleware matcher.
// Read-only: it touches nothing the submission path uses.
export async function GET() {
  try {
    const sheets = await getSheetsClient(true);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.AWARDS_SHEET_ID,
      range: 'Sheet1!A:ZZ',
    });

    const workbook = await buildCategoryWorkbook(
      buildCategoryExport((response.data.values as string[][]) || [])
    );

    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(workbook, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="awards-submissions-by-category-${date}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Error exporting submissions:', error);
    return NextResponse.json({ error: 'Failed to export submissions' }, { status: 500 });
  }
}
