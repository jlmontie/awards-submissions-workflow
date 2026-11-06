import { NextRequest, NextResponse } from 'next/server';
import { getSheetsClient } from '@/lib/google-sheets';
import { buildProjectTeamWorkbook, buildWinnerProjects } from '@/lib/awards/project-team-export';
import { filterValuesByYear } from '@/lib/awards/sheet-rows';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Admin-only through the /api/awards/admin/:path* middleware matcher.
// Read-only: it touches nothing the submission path uses.
export async function GET(request: NextRequest) {
  try {
    const year = request.nextUrl.searchParams.get('year');
    const sheets = await getSheetsClient(true);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.AWARDS_SHEET_ID,
      range: 'Sheet1!A:ZZ',
    });

    const projects = buildWinnerProjects(
      filterValuesByYear((response.data.values as string[][]) || [], year)
    );
    if (projects.length === 0) {
      const scope = year ? ` for ${year}` : '';
      return NextResponse.json(
        { error: `No winners found${scope}. Fill in the Winner Category column in the sheet first.` },
        { status: 404 }
      );
    }

    const workbook = await buildProjectTeamWorkbook(projects);
    const date = new Date().toISOString().slice(0, 10);
    const scope = year ? `${year}-` : '';
    return new NextResponse(workbook, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="awards-${scope}winners-project-team-${date}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Error exporting project teams:', error);
    return NextResponse.json({ error: 'Failed to export project teams' }, { status: 500 });
  }
}
