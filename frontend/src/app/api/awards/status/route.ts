import { NextResponse } from 'next/server';
import { getSheetsClient } from '@/lib/google-sheets';
import { currentSubmissionWindow, publicAwardYears } from '@/lib/awards/award-years-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const readSheets = () => getSheetsClient(true);

// Public: whether the awards form is taking entries, for the /awards page.
// The upload route enforces the same rule on its own; this only drives what
// the page shows.
export async function GET() {
  const window = await currentSubmissionWindow(readSheets);
  const { years } = await publicAwardYears(readSheets);
  const closes = window.year ? years.find((y) => y.year === window.year)?.closes || null : null;

  return NextResponse.json(
    window.accepting
      ? { accepting: true, year: window.year, closes }
      : { accepting: false, year: window.year, reason: window.reason },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
