import { NextRequest, NextResponse } from 'next/server';
import { getSheetsClient } from '@/lib/google-sheets';
import { buildCategoryExport, buildCategoryWorkbook } from '@/lib/awards/category-export';
import { readSubmissionValues } from '@/lib/awards/award-years-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Admin-only through the /api/awards/admin/:path* middleware matcher.
// Read-only: it touches nothing the submission path uses.
export async function GET(request: NextRequest) {
  try {
    const year = request.nextUrl.searchParams.get('year');
    const values = await readSubmissionValues(await getSheetsClient(true), year);

    const workbook = await buildCategoryWorkbook(
      buildCategoryExport(values)
    );

    const date = new Date().toISOString().slice(0, 10);
    const scope = year ? `${year}-` : '';
    return new NextResponse(workbook, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="awards-${scope}submissions-by-category-${date}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Error exporting submissions:', error);
    return NextResponse.json({ error: 'Failed to export submissions' }, { status: 500 });
  }
}
