import { NextRequest, NextResponse } from 'next/server';
import { getSheetsClient } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { templateId, name, year, deadline } = body;

    if (!templateId || !name || !year) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 },
      );
    }

    const spreadsheetId = process.env.SURVEY_SHEET_ID;
    if (!spreadsheetId) {
      return NextResponse.json(
        { error: 'Survey system not configured' },
        { status: 500 },
      );
    }

    const sheets = await getSheetsClient();

    // Generate survey_id from template + year (e.g., ARCH-2026)
    const prefix = templateId === 'architects' ? 'ARCH' : templateId.toUpperCase().slice(0, 4);
    const surveyId = `${prefix}-${year}`;

    // Append survey row to Surveys tab
    // Columns: survey_id | name | category | year | deadline | status | template_id
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Surveys!A:G',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[surveyId, name, templateId, year, deadline || '', 'draft', templateId]],
      },
    });

    return NextResponse.json({ surveyId });
  } catch (error: any) {
    console.error('Error creating survey:', error);
    return NextResponse.json(
      { error: 'Failed to create survey' },
      { status: 500 },
    );
  }
}
