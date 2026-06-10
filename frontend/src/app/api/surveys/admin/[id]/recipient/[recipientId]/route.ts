import { NextRequest, NextResponse } from 'next/server';
import { getSheetsClient } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Mirrors RESPONSE_COLUMNS in /api/surveys/admin/[id]/export and
// /api/surveys/token/[token]. Used as a fallback when the sheet lacks
// a header row.
const RESPONSE_COLUMNS = [
  'response_id', 'survey_id', 'recipient_id', 'token', 'submitted_at',
  'firm_name', 'location', 'year_founded', 'top_executive',
  'top_executive_title', 'years_at_firm', 'address', 'city', 'state',
  'zip', 'phone', 'marketing_email', 'website', 'other_locations',
  'num_employees', 'num_licensed_architects', 'num_leed_ap',
  'revenue_current', 'revenue_prior_1', 'revenue_prior_2', 'revenue_dnd',
  'largest_project_completed', 'largest_project_completed_location',
  'largest_project_upcoming', 'largest_project_upcoming_location',
  'pct_k12', 'pct_higher_ed', 'pct_civic', 'pct_healthcare',
  'pct_office', 'pct_resort_hospitality', 'pct_multi_family',
  'pct_commercial_retail', 'pct_sports_rec', 'pct_industrial', 'pct_other',
  'other_segment_name',
];

/**
 * GET /api/surveys/admin/[id]/recipient/[recipientId]
 *
 * Admin-facing read of a single recipient's submitted response. Returns the
 * survey metadata + recipient firm/contact info + the field/value map so the
 * admin can see what was submitted without opening the survey link itself.
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

    const [surveysRes, recipientsRes, responsesRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId, range: 'Surveys!A:Z' }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: 'Survey Recipients!A:Z' }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: 'Survey Responses!A:AZ' }),
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

    const responseRows = responsesRes.data.values || [];
    let response: Record<string, string> | null = null;
    if (responseRows.length > 0) {
      const hasHeader =
        (responseRows[0][0] || '').trim().toLowerCase() === 'response_id';
      const headers = hasHeader
        ? responseRows[0].map((h) => h.trim().toLowerCase())
        : RESPONSE_COLUMNS;
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

    return NextResponse.json({
      survey: {
        surveyId,
        name: surveyRow[sNameCol] || '',
        year: parseInt(surveyRow[sYearCol] || '0', 10),
        templateId: surveyRow[sTemplateCol] || '',
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
