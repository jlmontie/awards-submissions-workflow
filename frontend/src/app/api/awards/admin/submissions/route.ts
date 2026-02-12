import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Submission {
  awardsId: string;
  status: string;
  projectName: string;
  firm: string;
  category: string;
  submittedAt: string;
  winnerCategory?: string;
  pdfLink?: string;
  folderLink?: string;
}

async function getSheetData() {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.SHEET_ID;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Sheet1!A:ZZ',
  });

  return response.data.values || [];
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const filter = searchParams.get('filter') || 'all';

    const data = await getSheetData();

    if (data.length < 2) {
      return NextResponse.json([]);
    }

    const headers = data[0];
    const rows = data.slice(1);

    // Find column indices
    const awardsIdIndex = headers.findIndex((h) => h === 'Awards ID');
    const statusIndex = headers.findIndex((h) => h === 'Status');
    const projectNameIndex = headers.findIndex((h) => h === 'Official Name');
    const firmIndex = headers.findIndex((h) => h === 'Name of Firm');
    const categoryIndex = headers.findIndex((h) => h === 'Project Category or Categories for Consideration');
    const submittedAtIndex = headers.findIndex((h) => h === 'Submission Timestamp');
    const winnerCategoryIndex = headers.findIndex((h) => h === 'Winner Category');
    const pdfLinkIndex = headers.findIndex((h) => h === 'PDF Link');
    const folderLinkIndex = headers.findIndex((h) => h === 'Project Folder');

    // Map rows to submissions
    const submissions: Submission[] = rows
      .map((row) => ({
        awardsId: row[awardsIdIndex] || '',
        status: row[statusIndex] || 'pending',
        projectName: row[projectNameIndex] || '(Unnamed)',
        firm: row[firmIndex] || '',
        category: row[categoryIndex] || '',
        submittedAt: row[submittedAtIndex] || '',
        winnerCategory: row[winnerCategoryIndex] || '',
        pdfLink: row[pdfLinkIndex] || '',
        folderLink: row[folderLinkIndex] || '',
      }))
      .filter((s) => {
        // Filter by status
        if (filter === 'all') return true;
        if (filter === 'pending') return s.status === 'pending';
        if (filter === 'winners') return s.status === 'winner';
        return true;
      })
      .sort((a, b) => {
        // Sort by Awards ID descending (newest first)
        return b.awardsId.localeCompare(a.awardsId);
      });

    return NextResponse.json(submissions);
  } catch (error: any) {
    console.error('Error fetching submissions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch submissions' },
      { status: 500 }
    );
  }
}
