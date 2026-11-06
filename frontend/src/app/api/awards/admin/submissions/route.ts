import { NextRequest, NextResponse } from 'next/server';
import { getSheetsClient } from '@/lib/google-sheets';
import { readSubmissionValues } from '@/lib/awards/award-years-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Submission {
  awardsId: string;
  projectName: string;
  firm: string;
  category: string;
  submittedAt: string;
  winnerCategory?: string;
  pdfLink?: string;
  folderLink?: string;
}

export async function GET(request: NextRequest) {
  try {
    const year = request.nextUrl.searchParams.get('year');

    const data = await readSubmissionValues(await getSheetsClient(true), year);

    if (data.length < 2) {
      return NextResponse.json([]);
    }

    const headers = data[0];
    const rows = data.slice(1);

    // Find column indices
    const awardsIdIndex = headers.findIndex((h) => h === 'Awards ID');
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
        projectName: row[projectNameIndex] || '(Unnamed)',
        firm: row[firmIndex] || '',
        category: row[categoryIndex] || '',
        submittedAt: row[submittedAtIndex] || '',
        winnerCategory: row[winnerCategoryIndex] || '',
        pdfLink: row[pdfLinkIndex] || '',
        folderLink: row[folderLinkIndex] || '',
      }))
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
