import { NextRequest, NextResponse } from 'next/server';
import { getSheetsClient } from '@/lib/google-sheets';
import {
  responseTabFor,
  SURVEYS_TAB,
  SURVEY_RECIPIENTS_TAB,
} from '@/lib/surveys/sheets';
import { ARCHITECT_RESPONSE_COLUMNS } from '@/lib/surveys/export/architects';
import { CONTRACTOR_RESPONSE_COLUMNS } from '@/lib/surveys/export/contractors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function fallbackColumnsFor(templateId: string): string[] {
  switch (templateId) {
    case 'contractors':
      return CONTRACTOR_RESPONSE_COLUMNS;
    case 'architects':
    default:
      return ARCHITECT_RESPONSE_COLUMNS;
  }
}

/**
 * GET /api/surveys/admin/[id]/recipient/[recipientId]
 *
 * Admin-facing read of a single recipient's submitted response. Returns the
 * survey metadata + recipient firm/contact info + the field/value map so the
 * admin can see what was submitted without opening the survey link itself.
 *
 * Reads the response from the per-template response tab determined by the
 * parent survey's `template_id`.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; recipientId: string } },
) {
  try {
    const { id: surveyId, recipientId } = params;
    const spreadsheetId = process.env.SURVEY_SHEET_ID;
    if (!spreadsheetId) {
      return NextResponse.json(
        { error: 'Survey system not configured' },
        { status: 500 },
      );
    }

    const sheets = await getSheetsClient(true);

    // Fetch surveys + recipients in parallel. Responses come from the
    // template-specific tab, so we fetch them after we know which template.
    const [surveysRes, recipientsRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${SURVEYS_TAB}!A:Z` }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${SURVEY_RECIPIENTS_TAB}!A:Z` }),
    ]);

    const surveyRows = surveysRes.data.values || [];
    if (surveyRows.length < 2) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }
    const sHeaders = surveyRows[0];
    const sIdCol = sHeaders.indexOf('survey_id');
    const sNameCol = sHeaders.indexOf('name');
    const sYearCol = sHeaders.indexOf('year');
    const sTemplateCol = sHeaders.indexOf('template_id');
    const surveyRow = surveyRows.slice(1).find((row) => row[sIdCol] === surveyId);
    if (!surveyRow) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }
    const templateId = surveyRow[sTemplateCol] || 'architects';

    const recipientRows = recipientsRes.data.values || [];
    if (recipientRows.length < 2) {
      return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
    }
    const rHeaders = recipientRows[0];
    const rIdCol = rHeaders.indexOf('recipient_id');
    const rFirmCol = rHeaders.indexOf('firm_name');
    const rStatusCol = rHeaders.indexOf('status');
    const rCompletedCol = rHeaders.indexOf('completed_at');
    const recipientRow = recipientRows.slice(1).find((row) => row[rIdCol] === recipientId);
    if (!recipientRow) {
      return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
    }

    let response: Record<string, string> | null = null;

    let responseTab: string | null = null;
    try {
      responseTab = responseTabFor(templateId);
    } catch {
      // Unknown template — leave response null
    }

    if (responseTab) {
      const responsesRes = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${responseTab}!A:BZ`,
      });
      const responseRows = responsesRes.data.values || [];
      if (responseRows.length > 0) {
        const hasHeader =
          (responseRows[0][0] || '').trim().toLowerCase() === 'response_id';
        const headers = hasHeader
          ? responseRows[0].map((h) => h.trim().toLowerCase())
          : fallbackColumnsFor(templateId);
        const dataRows = hasHeader ? responseRows.slice(1) : responseRows;
        const respRecipientCol = headers.indexOf('recipient_id');
        if (respRecipientCol !== -1) {
          const row = dataRows.find((r) => r[respRecipientCol] === recipientId);
          if (row) {
            response = {};
            for (let i = 0; i < headers.length; i++) {
              response[headers[i]] = row[i] ?? '';
            }
          }
        }
      }
    }

    return NextResponse.json({
      survey: {
        surveyId,
        name: surveyRow[sNameCol] || '',
        year: parseInt(surveyRow[sYearCol] || '0', 10),
        templateId,
      },
      recipient: {
        recipientId,
        firmName: recipientRow[rFirmCol] || '',
        status: recipientRow[rStatusCol] || '',
        completedAt: rCompletedCol !== -1 ? recipientRow[rCompletedCol] || '' : '',
      },
      response,
    });
  } catch (error: any) {
    console.error('Error fetching recipient response:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recipient response' },
      { status: 500 },
    );
  }
}
