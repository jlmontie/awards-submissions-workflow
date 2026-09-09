import { NextRequest, NextResponse } from 'next/server';
import { batchGetValues, getSheetsClient } from '@/lib/google-sheets';
import { activeFirmContacts } from '@/lib/surveys/contacts';
import { EMAIL_TEMPLATE_RANGE, parseTemplates } from '@/lib/surveys/email-templates';
import {
  EMAIL_VARIANTS,
  renderInvitationEmail,
  validateTemplate,
  variantForStatus,
  type EmailTemplate,
  type EmailVariant,
} from '@/lib/surveys/invitation-email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/surveys/admin/[id]/email/preview
 *
 * Render one variant exactly as the send route would, against a real recipient
 * of that variant where one exists. Rendering lives server-side so the editor
 * preview and the sent message can't diverge.
 *
 * Body: { variant: 'first' | 'reminder', template?: EmailTemplate }
 * A `template` previews unsaved edits; omitting it previews what is stored.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const surveyId = params.id;
    const body = await request.json();
    const rawVariant = body?.variant;
    const templateOverride = body?.template as EmailTemplate | undefined;

    if (
      typeof rawVariant !== 'string' ||
      !(EMAIL_VARIANTS as readonly string[]).includes(rawVariant)
    ) {
      return NextResponse.json(
        { error: `variant must be one of: ${EMAIL_VARIANTS.join(', ')}` },
        { status: 400 },
      );
    }
    const variant = rawVariant as EmailVariant;

    if (templateOverride) {
      const errors = validateTemplate(templateOverride);
      if (errors.length > 0) {
        return NextResponse.json({ error: errors.join(' ') }, { status: 400 });
      }
    }

    const spreadsheetId = process.env.SURVEY_SHEET_ID;
    if (!spreadsheetId) {
      return NextResponse.json({ error: 'Survey system not configured' }, { status: 500 });
    }
    const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');

    const sheets = await getSheetsClient(true);
    const [surveyValues, recipientValues, contactValues, templateValues] =
      await batchGetValues(sheets, spreadsheetId, [
        'Surveys!A:Z',
        'Survey Recipients!A:Z',
        'Survey Contacts!A:Z',
        EMAIL_TEMPLATE_RANGE,
      ]);

    // --- Survey metadata ---
    const surveyRows = surveyValues || [];
    const sHeaders = surveyRows[0] || [];
    const sIdCol = sHeaders.indexOf('survey_id');
    const surveyRow =
      sIdCol === -1 ? undefined : surveyRows.slice(1).find((r) => r[sIdCol] === surveyId);
    if (!surveyRow) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }
    const surveyName = surveyRow[sHeaders.indexOf('name')] || 'Survey';
    const surveyCategory = surveyRow[sHeaders.indexOf('category')] || '';
    const surveyDeadline = surveyRow[sHeaders.indexOf('deadline')] || '';

    // --- Sample recipient: prefer one this variant would actually go to ---
    const recipientRows = recipientValues || [];
    const rHeaders = recipientRows[0] || [];
    const rSurveyIdCol = rHeaders.indexOf('survey_id');
    const rFirmCol = rHeaders.indexOf('firm_name');
    const rTokenCol = rHeaders.indexOf('token');
    const rStatusCol = rHeaders.indexOf('status');

    const candidates = recipientRows
      .slice(1)
      .filter((row) => row[rSurveyIdCol] === surveyId && row[rStatusCol] !== 'completed');

    const sample =
      candidates.find((row) => variantForStatus(row[rStatusCol] || '') === variant) ||
      candidates[0];

    const sampleFirm = sample ? (sample[rFirmCol] || '').trim() : '';
    const sampleContact = sampleFirm
      ? activeFirmContacts(contactValues || [], sampleFirm, surveyCategory)[0]
      : undefined;

    // --- Copy: unsaved edits if supplied, otherwise what's stored ---
    const template =
      templateOverride || parseTemplates(templateValues, surveyId)[variant].template;

    const rendered = renderInvitationEmail({
      template,
      variant,
      vars: {
        contact_name: sampleContact?.name || 'Sample Contact',
        firm_name: sampleFirm || 'Sample Firm',
        survey_name: surveyName,
        deadline: surveyDeadline,
        survey_url: `${appUrl}/surveys/${(sample && sample[rTokenCol]) || 'sample-token'}`,
      },
      appUrl,
    });

    return NextResponse.json({
      variant,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      // Lets the editor say "previewed against Acme Engineering" vs. warn that
      // it's showing placeholder values because no recipient matched.
      sampleFirm: sampleFirm || null,
      sampleContact: sampleContact?.name || null,
      usedSampleData: !sample,
      hasDeadline: Boolean(surveyDeadline.trim()),
    });
  } catch (error: any) {
    console.error('Error rendering email preview:', error);
    return NextResponse.json({ error: 'Failed to render preview' }, { status: 500 });
  }
}
