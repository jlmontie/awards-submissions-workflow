import { NextRequest, NextResponse } from 'next/server';
import { getSheetsClient } from '@/lib/google-sheets';
import { readSubmissionValues } from '@/lib/awards/award-years-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const awardsId = params.id;
    // The Awards ID says which year's sheet to look in.
    const year = awardsId.match(/^AW-(\d{4})-/)?.[1] ?? null;
    const data = await readSubmissionValues(await getSheetsClient(true), year);

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
