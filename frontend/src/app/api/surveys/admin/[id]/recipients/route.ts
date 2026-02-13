import { NextRequest, NextResponse } from 'next/server';
import { getSheetsClient } from '@/lib/google-sheets';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/surveys/admin/[id]/recipients
 *
 * Import recipients from the master contact list (Survey Contacts tab).
 * Groups contacts by firm_name — one recipient row per unique firm.
 * Skips firms already in Survey Recipients for this survey_id (idempotent).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const surveyId = params.id;
    const spreadsheetId = process.env.SURVEY_SHEET_ID;

    if (!spreadsheetId) {
      return NextResponse.json(
        { error: 'Survey system not configured' },
        { status: 500 },
      );
    }

    const sheets = await getSheetsClient();

    // Fetch survey to get its category, plus contacts and existing recipients
    const [surveysRes, contactsRes, recipientsRes] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Surveys!A:Z',
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Survey Contacts!A:Z',
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Survey Recipients!A:Z',
      }),
    ]);

    // Find survey category
    const surveyRows = surveysRes.data.values || [];
    if (surveyRows.length < 2) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    const sHeaders = surveyRows[0];
    const sIdCol = sHeaders.indexOf('survey_id');
    const sCategoryCol = sHeaders.indexOf('category');

    const surveyRow = surveyRows.slice(1).find((row) => row[sIdCol] === surveyId);
    if (!surveyRow) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }
    const surveyCategory = surveyRow[sCategoryCol] || '';

    // Parse master contact list — filter by category + active
    const contactRows = contactsRes.data.values || [];
    if (contactRows.length < 2) {
      return NextResponse.json(
        { error: 'No contacts found in the master contact list' },
        { status: 404 },
      );
    }

    const cHeaders = contactRows[0];
    const cFirmCol = cHeaders.indexOf('firm_name');
    const cCategoryCol = cHeaders.indexOf('category');
    const cActiveCol = cHeaders.indexOf('active');

    // Collect unique firm names from active contacts matching the survey category
    const firmNames = new Set<string>();
    for (let i = 1; i < contactRows.length; i++) {
      const row = contactRows[i];
      const category = (row[cCategoryCol] || '').trim().toLowerCase();
      const active = (row[cActiveCol] || '').trim().toUpperCase();
      const firmName = (row[cFirmCol] || '').trim();

      if (category === surveyCategory && active === 'TRUE' && firmName) {
        firmNames.add(firmName);
      }
    }

    if (firmNames.size === 0) {
      return NextResponse.json({
        imported: 0,
        skipped: 0,
        total: 0,
        message: `No active contacts found for category "${surveyCategory}"`,
      });
    }

    // Find firms already in Survey Recipients for this survey
    const recipientRows = recipientsRes.data.values || [];
    const existingFirms = new Set<string>();

    if (recipientRows.length >= 2) {
      const rHeaders = recipientRows[0];
      const rSurveyIdCol = rHeaders.indexOf('survey_id');
      const rFirmCol = rHeaders.indexOf('firm_name');

      for (let i = 1; i < recipientRows.length; i++) {
        const row = recipientRows[i];
        if (row[rSurveyIdCol] === surveyId) {
          existingFirms.add((row[rFirmCol] || '').trim());
        }
      }
    }

    // Generate new recipient rows for firms not yet imported
    let nextId = (recipientRows.length > 0 ? recipientRows.length : 1); // accounts for header
    const newRows: string[][] = [];

    for (const firmName of firmNames) {
      if (existingFirms.has(firmName)) continue;

      const recipientId = `R-${String(nextId++).padStart(3, '0')}`;
      const token = randomUUID();
      // Columns: recipient_id | survey_id | firm_name | token | status | sent_at | reminded_at | completed_at
      newRows.push([recipientId, surveyId, firmName, token, 'pending', '', '', '']);
    }

    if (newRows.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Survey Recipients!A:H',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: newRows,
        },
      });
    }

    const skipped = firmNames.size - newRows.length;

    return NextResponse.json({
      imported: newRows.length,
      skipped,
      total: firmNames.size,
    });
  } catch (error: any) {
    console.error('Error importing recipients:', error);
    return NextResponse.json(
      { error: 'Failed to import recipients' },
      { status: 500 },
    );
  }
}
