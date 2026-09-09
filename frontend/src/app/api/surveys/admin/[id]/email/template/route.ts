import { NextRequest, NextResponse } from 'next/server';
import { batchGetValues, getSheetsClient } from '@/lib/google-sheets';
import {
  EMAIL_TEMPLATE_RANGE,
  deleteTemplate,
  parseTemplates,
  saveTemplate,
} from '@/lib/surveys/email-templates';
import {
  EMAIL_VARIANTS,
  TEMPLATE_TOKENS,
  validateTemplate,
  type EmailTemplate,
  type EmailVariant,
} from '@/lib/surveys/invitation-email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function parseVariant(value: unknown): EmailVariant | null {
  return typeof value === 'string' && (EMAIL_VARIANTS as readonly string[]).includes(value)
    ? (value as EmailVariant)
    : null;
}

/** Survey name + deadline, or null when the survey doesn't exist. */
function findSurvey(
  surveyRows: string[][] | null,
  surveyId: string,
): { name: string; deadline: string } | null {
  const rows = surveyRows || [];
  if (rows.length < 2) return null;

  const headers = rows[0];
  const idCol = headers.indexOf('survey_id');
  const nameCol = headers.indexOf('name');
  const deadlineCol = headers.indexOf('deadline');
  if (idCol === -1) return null;

  const row = rows.slice(1).find((r) => r[idCol] === surveyId);
  if (!row) return null;

  return {
    name: nameCol === -1 ? '' : row[nameCol] || '',
    deadline: deadlineCol === -1 ? '' : row[deadlineCol] || '',
  };
}

/**
 * GET /api/surveys/admin/[id]/email/template
 *
 * The invitation and reminder copy for one survey, each flagged as saved copy
 * or the shipped default, plus the survey context the editor needs (deadline,
 * available placeholders).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const surveyId = params.id;

    const spreadsheetId = process.env.SURVEY_SHEET_ID;
    if (!spreadsheetId) {
      return NextResponse.json({ error: 'Survey system not configured' }, { status: 500 });
    }

    const sheets = await getSheetsClient(true);
    const [surveyValues, templateValues] = await batchGetValues(sheets, spreadsheetId, [
      'Surveys!A:Z',
      EMAIL_TEMPLATE_RANGE,
    ]);

    const survey = findSurvey(surveyValues, surveyId);
    if (!survey) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    return NextResponse.json({
      surveyId,
      surveyName: survey.name,
      deadline: survey.deadline,
      // The editor warns on this: slots referencing {{deadline}} fall back to
      // generic copy when the survey has no deadline set.
      hasDeadline: Boolean(survey.deadline.trim()),
      tokens: TEMPLATE_TOKENS,
      variants: parseTemplates(templateValues, surveyId),
    });
  } catch (error: any) {
    console.error('Error loading email templates:', error);
    return NextResponse.json({ error: 'Failed to load email templates' }, { status: 500 });
  }
}

/**
 * PUT /api/surveys/admin/[id]/email/template
 * Body: { variant: 'first' | 'reminder', template: EmailTemplate }
 *
 * Saves copy for one variant. Validation is the same one the send route runs,
 * so copy that saves here is copy that will send.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const surveyId = params.id;
    const body = await request.json();
    const variant = parseVariant(body?.variant);
    const template = body?.template as EmailTemplate | undefined;

    if (!variant) {
      return NextResponse.json(
        { error: `variant must be one of: ${EMAIL_VARIANTS.join(', ')}` },
        { status: 400 },
      );
    }
    if (!template || typeof template !== 'object') {
      return NextResponse.json({ error: 'template is required' }, { status: 400 });
    }

    const errors = validateTemplate(template);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(' ') }, { status: 400 });
    }

    const spreadsheetId = process.env.SURVEY_SHEET_ID;
    if (!spreadsheetId) {
      return NextResponse.json({ error: 'Survey system not configured' }, { status: 500 });
    }

    const sheets = await getSheetsClient();

    // Don't create rows for a survey that doesn't exist — a typo'd id would
    // otherwise leave orphaned copy in the tab forever.
    const [surveyValues] = await batchGetValues(sheets, spreadsheetId, ['Surveys!A:Z']);
    if (!findSurvey(surveyValues, surveyId)) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    await saveTemplate(sheets, spreadsheetId, surveyId, variant, template);
    console.log(`[email-template] Saved ${variant} template for survey ${surveyId}`);

    return NextResponse.json({ saved: true, variant });
  } catch (error: any) {
    console.error('Error saving email template:', error);
    return NextResponse.json({ error: 'Failed to save email template' }, { status: 500 });
  }
}

/**
 * DELETE /api/surveys/admin/[id]/email/template?variant=reminder
 *
 * Reverts one variant to the shipped default copy.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const surveyId = params.id;
    const variant = parseVariant(request.nextUrl.searchParams.get('variant'));

    if (!variant) {
      return NextResponse.json(
        { error: `variant must be one of: ${EMAIL_VARIANTS.join(', ')}` },
        { status: 400 },
      );
    }

    const spreadsheetId = process.env.SURVEY_SHEET_ID;
    if (!spreadsheetId) {
      return NextResponse.json({ error: 'Survey system not configured' }, { status: 500 });
    }

    const sheets = await getSheetsClient();
    const removed = await deleteTemplate(sheets, spreadsheetId, surveyId, variant);
    console.log(
      `[email-template] Reset ${variant} template for survey ${surveyId} (row ${removed ? 'cleared' : 'not present'})`,
    );

    return NextResponse.json({ reset: true, variant, removed });
  } catch (error: any) {
    console.error('Error resetting email template:', error);
    return NextResponse.json({ error: 'Failed to reset email template' }, { status: 500 });
  }
}
