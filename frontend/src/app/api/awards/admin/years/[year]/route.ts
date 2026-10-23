import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSheetsClient } from '@/lib/google-sheets';
import { AwardYearError, updateAwardYear } from '@/lib/awards/award-years-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Admin-only through the /api/awards/admin/:path* middleware matcher.
export async function PATCH(request: NextRequest, { params }: { params: { year: string } }) {
  try {
    const session = await getServerSession(authOptions);
    const { status, opens, closes } = await request.json();
    const year = await updateAwardYear(
      await getSheetsClient(),
      params.year,
      { status, opens, closes },
      session?.user?.email || ''
    );
    return NextResponse.json(year);
  } catch (error) {
    if (error instanceof AwardYearError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error updating award year:', error);
    return NextResponse.json({ error: 'Failed to update award year' }, { status: 500 });
  }
}
