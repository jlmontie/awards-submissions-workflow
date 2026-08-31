import { NextResponse } from 'next/server';
import { batchGetValues, getSheetsClient } from '@/lib/google-sheets';
import {
  RESPONSE_TABS,
  SURVEYS_TAB,
  SURVEY_RECIPIENTS_TAB,
} from '@/lib/surveys/sheets';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const spreadsheetId = process.env.SURVEY_SHEET_ID;
    if (!spreadsheetId) {
      return NextResponse.json(
        { error: 'Survey system not configured' },
        { status: 500 },
      );
    }

    const sheets = await getSheetsClient(true);

    const responseTabNames = Object.values(RESPONSE_TABS);

    // Surveys, recipients, and every per-template response tab in a single
    // round trip. batchGetValues degrades to per-range reads only if a tab is
    // missing (e.g. a new template whose sheet hasn't been created yet), so one
    // absent tab still doesn't fail the whole list.
    const [surveyValues, recipientValues, ...responseValues] = await batchGetValues(
      sheets,
      spreadsheetId,
      [
        `${SURVEYS_TAB}!A:Z`,
        `${SURVEY_RECIPIENTS_TAB}!A:Z`,
        ...responseTabNames.map((tab) => `${tab}!A:B`),
      ],
    );

    const surveyRows = surveyValues || [];
    const recipientRows = recipientValues || [];
    const responseRowsByTab = responseValues.map((rows) => rows || []);

    if (surveyRows.length < 2) {
      return NextResponse.json([]);
    }

    // Parse survey headers
    const sHeaders = surveyRows[0];
    const sIdCol = sHeaders.indexOf('survey_id');
    const sNameCol = sHeaders.indexOf('name');
    const sCategoryCol = sHeaders.indexOf('category');
    const sYearCol = sHeaders.indexOf('year');
    const sDeadlineCol = sHeaders.indexOf('deadline');
    const sStatusCol = sHeaders.indexOf('status');
    const sTemplateCol = sHeaders.indexOf('template_id');

    // Build recipient counts by survey_id
    const recipientCounts: Record<string, number> = {};
    if (recipientRows.length >= 2) {
      const rSurveyIdCol = recipientRows[0].indexOf('survey_id');
      for (let i = 1; i < recipientRows.length; i++) {
        const sid = recipientRows[i][rSurveyIdCol] || '';
        recipientCounts[sid] = (recipientCounts[sid] || 0) + 1;
      }
    }

    // Build response counts by survey_id across all per-template response tabs
    const responseCounts: Record<string, number> = {};
    for (const responseRows of responseRowsByTab) {
      if (responseRows.length < 2) continue;
      const respSurveyIdCol = responseRows[0].indexOf('survey_id');
      if (respSurveyIdCol === -1) continue;
      for (let i = 1; i < responseRows.length; i++) {
        const sid = responseRows[i][respSurveyIdCol] || '';
        if (!sid) continue;
        responseCounts[sid] = (responseCounts[sid] || 0) + 1;
      }
    }

    // Map surveys
    const surveys = surveyRows.slice(1).map((row) => {
      const surveyId = row[sIdCol] || '';
      return {
        surveyId,
        name: row[sNameCol] || '',
        category: row[sCategoryCol] || '',
        year: row[sYearCol] || '',
        deadline: row[sDeadlineCol] || '',
        status: row[sStatusCol] || 'draft',
        templateId: row[sTemplateCol] || '',
        recipientCount: recipientCounts[surveyId] || 0,
        responseCount: responseCounts[surveyId] || 0,
      };
    });

    return NextResponse.json(surveys);
  } catch (error: any) {
    console.error('Error fetching survey list:', error);
    return NextResponse.json(
      { error: 'Failed to fetch surveys' },
      { status: 500 },
    );
  }
}
