import { NextRequest, NextResponse } from 'next/server';
import { getSheetsClient } from '@/lib/google-sheets';
import { surveyTemplates } from '@/lib/surveys/templates';
import type { SurveyTemplate } from '@/lib/surveys/templates';
import { responseTabFor, SURVEYS_TAB, SURVEY_RECIPIENTS_TAB } from '@/lib/surveys/sheets';
import { buildSubmissionSummary } from '@/lib/surveys/summary';
import { generateSubmissionPdf } from '@/lib/surveys/pdf';
import { submissionPdfFilename } from '@/lib/surveys/submission-email';
import { ARCHITECT_RESPONSE_COLUMNS } from '@/lib/surveys/export/architects';
import { CONTRACTOR_RESPONSE_COLUMNS } from '@/lib/surveys/export/contractors';
import { ENGINEER_RESPONSE_COLUMNS } from '@/lib/surveys/export/engineers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function fallbackColumnsFor(templateId: string): string[] {
  switch (templateId) {
    case 'contractors':
      return CONTRACTOR_RESPONSE_COLUMNS;
    case 'engineers':
      return ENGINEER_RESPONSE_COLUMNS;
    case 'architects':
    default:
      return ARCHITECT_RESPONSE_COLUMNS;
  }
}

/**
 * Coerce a positional response row into a form-data object keyed by field key.
 * Checkbox fields are converted from 'TRUE'/'FALSE' strings back to booleans so
 * the summary renders Yes/No correctly (a raw 'FALSE' string is truthy).
 */
function responseRowToData(
  template: SurveyTemplate,
  headers: string[],
  row: string[],
): Record<string, string | boolean> {
  const byKey: Record<string, string> = {};
  for (let i = 0; i < headers.length; i++) {
    if (headers[i]) byKey[headers[i]] = row[i] ?? '';
  }
  const data: Record<string, string | boolean> = { ...byKey };
  for (const section of template.sections) {
    for (const field of section.fields) {
      if (field.type === 'checkbox') {
        data[field.key] = String(byKey[field.key] || '').toUpperCase() === 'TRUE';
      }
    }
  }
  return data;
}

/**
 * GET /api/surveys/responses/pdf?token=...
 *
 * Returns a PDF copy of the recipient's submission for the given token. Used by
 * the "Download PDF copy" button on the confirmation page.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    const spreadsheetId = process.env.SURVEY_SHEET_ID;
    if (!spreadsheetId) {
      return NextResponse.json({ error: 'Survey system not configured' }, { status: 500 });
    }

    const sheets = await getSheetsClient(true);

    const [recipientsRes, surveysRes] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${SURVEY_RECIPIENTS_TAB}!A:Z`,
      }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: `${SURVEYS_TAB}!A:Z` }),
    ]);

    // --- Recipient by token ---
    const recipientRows = recipientsRes.data.values || [];
    if (recipientRows.length < 2) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }
    const rHeaders = recipientRows[0];
    const rTokenCol = rHeaders.indexOf('token');
    const rSurveyIdCol = rHeaders.indexOf('survey_id');
    const rRecipientIdCol = rHeaders.indexOf('recipient_id');
    const rFirmCol = rHeaders.indexOf('firm_name');
    const rStatusCol = rHeaders.indexOf('status');
    const rDraftCol = rHeaders.indexOf('draft_data');

    const recipientRow = recipientRows.slice(1).find((r) => r[rTokenCol] === token);
    if (!recipientRow) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }
    const surveyId = recipientRow[rSurveyIdCol];
    const recipientId = recipientRow[rRecipientIdCol] || '';
    const firmName = (recipientRow[rFirmCol] || '').trim();
    const isCompleted = recipientRow[rStatusCol] === 'completed';

    // --- Survey metadata ---
    const surveyRows = surveysRes.data.values || [];
    const sHeaders = surveyRows[0] || [];
    const sIdCol = sHeaders.indexOf('survey_id');
    const sNameCol = sHeaders.indexOf('name');
    const sYearCol = sHeaders.indexOf('year');
    const sTemplateCol = sHeaders.indexOf('template_id');
    const surveyRow = surveyRows.slice(1).find((r) => r[sIdCol] === surveyId);
    if (!surveyRow) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }
    const templateId = (sTemplateCol !== -1 ? surveyRow[sTemplateCol] : '') || 'architects';
    const surveyName = (sNameCol !== -1 ? surveyRow[sNameCol] : '') || 'Survey';
    const surveyYear = parseInt(
      (sYearCol !== -1 ? surveyRow[sYearCol] : '') || String(new Date().getFullYear()),
      10,
    );

    const template = surveyTemplates[templateId];
    if (!template) {
      return NextResponse.json({ error: 'Unknown survey type' }, { status: 400 });
    }

    // --- Load submitted answers (response tab) or fall back to the draft ---
    let data: Record<string, string | boolean> | null = null;
    let submittedAt = new Date().toISOString();

    if (isCompleted) {
      let responseTab = '';
      try {
        responseTab = responseTabFor(templateId);
      } catch {
        responseTab = '';
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
          const recipientCol = headers.indexOf('recipient_id');
          const submittedAtCol = headers.indexOf('submitted_at');
          if (recipientCol !== -1) {
            const match = dataRows.find((r) => r[recipientCol] === recipientId);
            if (match) {
              data = responseRowToData(template, headers, match);
              if (submittedAtCol !== -1 && match[submittedAtCol]) {
                submittedAt = match[submittedAtCol];
              }
            }
          }
        }
      }
    } else if (rDraftCol !== -1 && recipientRow[rDraftCol]) {
      try {
        data = JSON.parse(recipientRow[rDraftCol]);
      } catch {
        data = null;
      }
    }

    if (!data) {
      return NextResponse.json({ error: 'No submission found for this link' }, { status: 404 });
    }

    const sections = buildSubmissionSummary(template, data, surveyYear);
    const pdf = await generateSubmissionPdf({
      surveyName,
      firmName,
      submittedAt,
      wasEdit: false,
      sections,
    });

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${submissionPdfFilename(firmName)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    console.error('Error generating submission PDF:', error?.message);
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }
}
