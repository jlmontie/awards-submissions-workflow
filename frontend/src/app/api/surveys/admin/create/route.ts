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

    // survey_id is the human-readable join key on every other sheet
    // (recipients, responses), so it has to be unique. Deterministic
    // ${prefix}-${year} (e.g., ARCH-2026). If one already exists for this
    // template+year, refuse — production should only ever have one survey
    // per (template, year), so a collision is almost always the admin
    // re-clicking "New Survey" instead of opening the existing draft.
    // For testing, use a fictitious year to keep IDs unique.
    const prefix = templateId === 'architects' ? 'ARCH' : templateId.toUpperCase().slice(0, 4);
    const surveyId = `${prefix}-${year}`;

    const existingRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Surveys!A:G',
    });
    const existingRows = existingRes.data.values || [];
    if (existingRows.length >= 2) {
      const headers = existingRows[0];
      const idCol = headers.indexOf('survey_id');
      const nameCol = headers.indexOf('name');
      const statusCol = headers.indexOf('status');
      const collision = existingRows.slice(1).find((row) => row[idCol] === surveyId);
      if (collision) {
        return NextResponse.json(
          {
            error: `A survey already exists for ${templateId} ${year}.`,
            existingSurveyId: surveyId,
            existingSurveyName: nameCol !== -1 ? collision[nameCol] || '' : '',
            existingSurveyStatus: statusCol !== -1 ? collision[statusCol] || '' : '',
          },
          { status: 409 },
        );
      }
    }

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
