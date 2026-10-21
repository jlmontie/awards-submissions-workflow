import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSheetsClient } from '@/lib/google-sheets';
import { submissionWindow } from '@/lib/awards/award-years';
import {
  AwardYearError,
  createAwardYear,
  readAwardYears,
} from '@/lib/awards/award-years-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Admin-only through the /api/awards/admin/:path* middleware matcher.

export async function GET() {
  try {
    const now = Date.now();
    const { configured, years } = await readAwardYears(await getSheetsClient(true));
    return NextResponse.json({
      configured,
      years: [...years].sort((a, b) => b.year.localeCompare(a.year)),
      // What the public form is doing right now, uncached, so the page
      // reflects a change as soon as it is made here.
      window: configured ? submissionWindow(years, now) : null,
    });
  } catch (error) {
    console.error('Error reading award years:', error);
    return NextResponse.json({ error: 'Failed to load award years' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const body = await request.json();
    const year = await createAwardYear(await getSheetsClient(), body, session?.user?.email || '');
    return NextResponse.json(year, { status: 201 });
  } catch (error) {
    if (error instanceof AwardYearError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error creating award year:', error);
    return NextResponse.json({ error: 'Failed to create award year' }, { status: 500 });
  }
}
