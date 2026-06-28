import { NextRequest, NextResponse } from 'next/server';
import { getSheetsClient } from '@/lib/google-sheets';
import { surveyTemplates, normalizeSubmission } from '@/lib/surveys/templates';
import { responseTabFor, SURVEYS_TAB, SURVEY_RECIPIENTS_TAB } from '@/lib/surveys/sheets';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/surveys/responses
 *
 * Submit a survey response.
 *
 * Body: { token: string, data: Record<string, string | boolean> }
 *
 * Looks up the recipient + parent survey, normalizes the submission via the
 * template's field-level normalizers, then writes a row to the per-template
 * response tab. If the recipient already has a response in that tab, the
 * existing row is overwritten in place (edit) — otherwise a new row is
 * appended (first submission).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, data } = body;

    if (!token || !data) {
      return NextResponse.json({ error: 'Missing token or data' }, { status: 400 });
    }

    const spreadsheetId = process.env.SURVEY_SHEET_ID;
    if (!spreadsheetId) {
      return NextResponse.json({ error: 'Survey system not configured' }, { status: 500 });
    }

    const sheets = await getSheetsClient();

    // 1. Look up recipient by token
    const recipientsRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SURVEY_RECIPIENTS_TAB}!A:Z`,
    });
    const recipientRows = recipientsRes.data.values || [];
    if (recipientRows.length < 2) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    const recipientHeaders = recipientRows[0];
    const tokenCol = recipientHeaders.indexOf('token');
    const surveyIdCol = recipientHeaders.indexOf('survey_id');
    const recipientIdCol = recipientHeaders.indexOf('recipient_id');
    const statusCol = recipientHeaders.indexOf('status');

    let recipientRowIndex = -1;
    let recipientRow: string[] | null = null;
    for (let i = 1; i < recipientRows.length; i++) {
      if (recipientRows[i][tokenCol] === token) {
        recipientRowIndex = i + 1;
        recipientRow = recipientRows[i];
        break;
      }
    }

    if (!recipientRow) {
      return NextResponse.json({ error: 'Invalid survey link' }, { status: 404 });
    }

    const isEditingExisting = recipientRow[statusCol] === 'completed';

    const surveyId = recipientRow[surveyIdCol];
    const recipientId = recipientRow[recipientIdCol];
    const now = new Date().toISOString();

    // 2. Look up survey row to determine template (and which response tab)
    const surveysRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SURVEYS_TAB}!A:Z`,
    });
    const surveyRows = surveysRes.data.values || [];
    if (surveyRows.length < 2) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }
    const sHeaders = surveyRows[0];
    const sIdCol = sHeaders.indexOf('survey_id');
    const sTemplateCol = sHeaders.indexOf('template_id');
    const surveyRow = surveyRows.slice(1).find((r) => r[sIdCol] === surveyId);
    if (!surveyRow) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }
    const templateId =
      (sTemplateCol !== -1 ? surveyRow[sTemplateCol] : '') || 'architects';

    let responseTab: string;
    try {
      responseTab = responseTabFor(templateId);
    } catch {
      return NextResponse.json(
        { error: `Unsupported survey template: ${templateId}` },
        { status: 400 },
      );
    }

    // 3. Apply field-level normalizers (e.g. 'Utah' → 'UT', phone formatting).
    // Falls through with the raw data if the template can't be resolved — we'd
    // rather write the submission than block on a template lookup.
    const template = surveyTemplates[templateId];
    const normalized: Record<string, unknown> = template
      ? normalizeSubmission(template, data)
      : data;

    // 4. Look up existing response for this recipient in this template's tab
    // so we can overwrite in place rather than append a duplicate row.
    const responsesRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${responseTab}!A:BZ`,
    });
    const responseRows = responsesRes.data.values || [];
    let existingResponseRowIndex = -1;
    let existingResponseId = '';

    if (responseRows.length >= 2) {
      const respHeaders = responseRows[0];
      const respRecipientCol = respHeaders.indexOf('recipient_id');
      const respIdCol = respHeaders.indexOf('response_id');
      if (respRecipientCol !== -1) {
        for (let i = 1; i < responseRows.length; i++) {
          if (responseRows[i][respRecipientCol] === recipientId) {
            existingResponseRowIndex = i + 1;
            existingResponseId = respIdCol !== -1 ? responseRows[i][respIdCol] || '' : '';
            break;
          }
        }
      }
    }

    // 5. Generate / reuse response ID. The counter is per-template (each
    // template's responses live in their own tab), so SR-YYYY-NNN is unique
    // within a tab; the (survey_id, response_id) pair stays globally unique.
    const responseId =
      existingResponseId ||
      `SR-${new Date().getFullYear()}-${String(responseRows.length).padStart(3, '0')}`;

    // 6. Build the row using the template-specific column projection
    const responseRow = buildResponseRow(templateId, {
      responseId, surveyId, recipientId, token, now, data: normalized,
    });

    if (existingResponseRowIndex !== -1) {
      // Editing an existing submission: overwrite the row in place.
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${responseTab}!A${existingResponseRowIndex}:${columnLetter(responseRow.length - 1)}${existingResponseRowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [responseRow] },
      });
    } else {
      // First submission: append a new row.
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${responseTab}!A:BZ`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [responseRow] },
      });
    }

    // 7. Update recipient status to "completed" (and completed_at on first submit only)
    if (statusCol !== -1) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SURVEY_RECIPIENTS_TAB}!${columnLetter(statusCol)}${recipientRowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['completed']],
        },
      });

      // Only stamp completed_at on the FIRST submission — preserve original timestamp on edits.
      if (!isEditingExisting) {
        const completedAtCol = recipientHeaders.indexOf('completed_at');
        if (completedAtCol !== -1) {
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${SURVEY_RECIPIENTS_TAB}!${columnLetter(completedAtCol)}${recipientRowIndex}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
              values: [[now]],
            },
          });
        }
      }
    }

    return NextResponse.json({ responseId, edited: isEditingExisting });
  } catch (error: any) {
    console.error('Error submitting survey response:', error);
    return NextResponse.json(
      { error: 'Failed to submit survey response' },
      { status: 500 },
    );
  }
}

interface RowContext {
  responseId: string;
  surveyId: string;
  recipientId: string;
  token: string;
  now: string;
  data: Record<string, unknown>;
}

function buildResponseRow(templateId: string, ctx: RowContext): string[] {
  switch (templateId) {
    case 'contractors':
      return contractorResponseRow(ctx);
    case 'architects':
    default:
      return architectResponseRow(ctx);
  }
}

function architectResponseRow({ responseId, surveyId, recipientId, token, now, data }: RowContext): string[] {
  return [
    responseId,
    surveyId,
    recipientId,
    token,
    now,
    data.firm_name,
    data.location,
    data.year_founded,
    data.top_executive,
    data.top_executive_title,
    data.years_at_firm,
    data.address,
    data.city,
    data.state,
    data.zip,
    data.phone,
    data.marketing_email,
    data.website,
    data.other_locations,
    data.num_employees,
    data.num_licensed_architects,
    data.num_leed_ap,
    data.revenue_current,
    data.revenue_prior_1,
    data.revenue_prior_2,
    data.revenue_dnd,
    data.largest_project_completed,
    data.largest_project_completed_location,
    data.largest_project_upcoming,
    data.largest_project_upcoming_location,
    data.pct_k12,
    data.pct_higher_ed,
    data.pct_civic,
    data.pct_healthcare,
    data.pct_office,
    data.pct_resort_hospitality,
    data.pct_multi_family,
    data.pct_commercial_retail,
    data.pct_sports_rec,
    data.pct_industrial,
    data.pct_other,
    data.other_segment_name,
  ].map(stringify);
}

function contractorResponseRow({ responseId, surveyId, recipientId, token, now, data }: RowContext): string[] {
  return [
    responseId,
    surveyId,
    recipientId,
    token,
    now,
    data.firm_name,
    data.year_founded,
    data.top_executive,
    data.top_executive_title,
    data.years_at_firm,
    data.address,
    data.city,
    data.state,
    data.zip,
    data.phone,
    data.marketing_email,
    data.website,
    data.other_locations,
    data.num_employees_ut,
    data.num_employees_all,
    data.discipline_general_building,
    data.discipline_heavy_highway,
    data.discipline_municipal_utility,
    data.revenue_dnd,
    data.revenue_ut_current,
    data.revenue_ut_prior_1,
    data.revenue_ut_prior_2,
    data.revenue_all_current,
    data.revenue_all_prior_1,
    data.revenue_all_prior_2,
    data.largest_project_completed,
    data.largest_project_completed_location,
    data.largest_project_upcoming,
    data.largest_project_upcoming_location,
    data.pct_k12,
    data.pct_higher_ed,
    data.pct_civic,
    data.pct_healthcare,
    data.pct_multi_family,
    data.pct_commercial_retail,
    data.pct_industrial,
    data.pct_resort_hospitality,
    data.pct_sports_rec,
    data.pct_religious,
    data.pct_underground,
    data.pct_telecomm,
    data.pct_wastewater,
    data.pct_heavy_civil,
    data.pct_water,
    data.pct_highway,
    data.pct_oil_gas,
    data.pct_power,
    data.pct_other,
    data.other_segment_name,
  ].map(stringify);
}

function stringify(v: unknown): string {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v);
}

/** Convert a 0-based column index to a spreadsheet column letter (A, B, ... Z, AA, ...) */
function columnLetter(index: number): string {
  let letter = '';
  let i = index;
  while (i >= 0) {
    letter = String.fromCharCode((i % 26) + 65) + letter;
    i = Math.floor(i / 26) - 1;
  }
  return letter;
}
