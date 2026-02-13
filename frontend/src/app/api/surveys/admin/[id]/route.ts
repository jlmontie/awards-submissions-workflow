import { NextRequest, NextResponse } from 'next/server';
import { getSheetsClient } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
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

    const sheets = await getSheetsClient(true);

    // Fetch surveys, recipients, and contacts in parallel
    const [surveysRes, recipientsRes, contactsRes] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Surveys!A:Z',
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Survey Recipients!A:Z',
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Survey Contacts!A:Z',
      }),
    ]);

    // Find survey
    const surveyRows = surveysRes.data.values || [];
    if (surveyRows.length < 2) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    const sHeaders = surveyRows[0];
    const sIdCol = sHeaders.indexOf('survey_id');
    const sNameCol = sHeaders.indexOf('name');
    const sCategoryCol = sHeaders.indexOf('category');
    const sYearCol = sHeaders.indexOf('year');
    const sDeadlineCol = sHeaders.indexOf('deadline');
    const sStatusCol = sHeaders.indexOf('status');
    const sTemplateCol = sHeaders.indexOf('template_id');

    const surveyRow = surveyRows.slice(1).find((row) => row[sIdCol] === surveyId);
    if (!surveyRow) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    const surveyCategory = surveyRow[sCategoryCol] || '';

    // Build contacts lookup by firm_name (from master list)
    const contactRows = contactsRes.data.values || [];
    const contactsByFirm: Record<string, { contactName: string; contactEmail: string }[]> = {};

    if (contactRows.length >= 2) {
      const cHeaders = contactRows[0];
      const cFirmCol = cHeaders.indexOf('firm_name');
      const cNameCol = cHeaders.indexOf('contact_name');
      const cEmailCol = cHeaders.indexOf('contact_email');
      const cCategoryCol = cHeaders.indexOf('category');
      const cActiveCol = cHeaders.indexOf('active');

      for (let i = 1; i < contactRows.length; i++) {
        const row = contactRows[i];
        const category = (row[cCategoryCol] || '').trim().toLowerCase();
        const active = (row[cActiveCol] || '').trim().toUpperCase();
        const firmName = (row[cFirmCol] || '').trim();

        if (category === surveyCategory && active === 'TRUE' && firmName) {
          if (!contactsByFirm[firmName]) contactsByFirm[firmName] = [];
          contactsByFirm[firmName].push({
            contactName: row[cNameCol] || '',
            contactEmail: row[cEmailCol] || '',
          });
        }
      }
    }

    // Find recipients for this survey (firm-level)
    const recipientRows = recipientsRes.data.values || [];
    const recipients: any[] = [];

    if (recipientRows.length >= 2) {
      const rHeaders = recipientRows[0];
      const rIdCol = rHeaders.indexOf('recipient_id');
      const rSurveyIdCol = rHeaders.indexOf('survey_id');
      const rFirmCol = rHeaders.indexOf('firm_name');
      const rTokenCol = rHeaders.indexOf('token');
      const rStatusCol = rHeaders.indexOf('status');
      const rSentAtCol = rHeaders.indexOf('sent_at');
      const rRemindedAtCol = rHeaders.indexOf('reminded_at');
      const rCompletedCol = rHeaders.indexOf('completed_at');

      for (let i = 1; i < recipientRows.length; i++) {
        const row = recipientRows[i];
        if (row[rSurveyIdCol] === surveyId) {
          const firmName = row[rFirmCol] || '';
          recipients.push({
            recipientId: row[rIdCol] || '',
            firmName,
            token: row[rTokenCol] || '',
            status: row[rStatusCol] || 'pending',
            sentAt: rSentAtCol !== -1 ? row[rSentAtCol] || '' : '',
            remindedAt: rRemindedAtCol !== -1 ? row[rRemindedAtCol] || '' : '',
            completedAt: rCompletedCol !== -1 ? row[rCompletedCol] || '' : '',
            contacts: contactsByFirm[firmName] || [],
          });
        }
      }
    }

    return NextResponse.json({
      survey: {
        surveyId: surveyRow[sIdCol] || '',
        name: surveyRow[sNameCol] || '',
        category: surveyRow[sCategoryCol] || '',
        year: parseInt(surveyRow[sYearCol] || '0', 10),
        deadline: surveyRow[sDeadlineCol] || '',
        status: surveyRow[sStatusCol] || 'draft',
        templateId: surveyRow[sTemplateCol] || '',
      },
      recipients,
    });
  } catch (error: any) {
    console.error('Error fetching survey detail:', error);
    return NextResponse.json(
      { error: 'Failed to fetch survey' },
      { status: 500 },
    );
  }
}
