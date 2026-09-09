import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { batchGetValues, getSheetsClient } from '@/lib/google-sheets';
import {
  EMAIL_TEMPLATE_RANGE,
  parseTemplates,
  saveTemplate,
} from '@/lib/surveys/email-templates';
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

/** Convert a 0-based column index to a spreadsheet column letter */
function columnLetter(index: number): string {
  let letter = '';
  let i = index;
  while (i >= 0) {
    letter = String.fromCharCode((i % 26) + 65) + letter;
    i = Math.floor(i / 26) - 1;
  }
  return letter;
}

/**
 * POST /api/surveys/admin/[id]/email
 *
 * Send survey invitation and/or reminder emails.
 *
 * Body:
 *   recipientIds?: string[]   - specific recipients (omit with all: true)
 *   all?: boolean             - every non-completed recipient
 *   variants?: EmailVariant[] - which of first/reminder to include
 *                               (default: both, matching prior behavior)
 *   template?: { first?, reminder? } - copy to use for this send, overriding
 *                               whatever is stored for the survey
 *   saveTemplate?: boolean    - also persist `template` as the survey's copy
 *   testTo?: string           - send a single test message to this address and
 *                               write nothing; requires exactly one variant
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const surveyId = params.id;
    const body = await request.json();
    const {
      recipientIds,
      all,
      variants: rawVariants,
      template: templateOverride,
      saveTemplate: shouldSaveTemplate,
      testTo,
    } = body as {
      recipientIds?: string[];
      all?: boolean;
      variants?: string[];
      template?: Partial<Record<EmailVariant, EmailTemplate>>;
      saveTemplate?: boolean;
      testTo?: string;
    };

    const isTestSend = typeof testTo === 'string' && testTo.trim().length > 0;

    if (!isTestSend && !all && (!recipientIds || recipientIds.length === 0)) {
      return NextResponse.json(
        { error: 'Provide recipientIds or set all: true' },
        { status: 400 },
      );
    }

    // Default to both variants so callers that predate this field (and the
    // existing "Email All Firms" button) keep their old behavior.
    const variants: EmailVariant[] = rawVariants
      ? (rawVariants.filter((v) => (EMAIL_VARIANTS as readonly string[]).includes(v)) as EmailVariant[])
      : [...EMAIL_VARIANTS];

    if (variants.length === 0) {
      return NextResponse.json(
        { error: `variants must contain at least one of: ${EMAIL_VARIANTS.join(', ')}` },
        { status: 400 },
      );
    }
    if (isTestSend && variants.length !== 1) {
      return NextResponse.json(
        { error: 'A test send requires exactly one variant' },
        { status: 400 },
      );
    }

    // Validate any inline copy up front — a bad placeholder should fail the
    // request, not go out to firms as a literal "{{typo}}".
    if (templateOverride) {
      const errors: string[] = [];
      for (const variant of EMAIL_VARIANTS) {
        const candidate = templateOverride[variant];
        if (!candidate) continue;
        errors.push(...validateTemplate(candidate).map((e) => `${variant}: ${e}`));
      }
      if (errors.length > 0) {
        return NextResponse.json({ error: errors.join(' ') }, { status: 400 });
      }
    }

    const spreadsheetId = process.env.SURVEY_SHEET_ID;
    if (!spreadsheetId) {
      return NextResponse.json(
        { error: 'Survey system not configured' },
        { status: 500 },
      );
    }

    // Validate SMTP config
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM || smtpUser;
    const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');

    if (!smtpHost || !smtpUser || !smtpPass) {
      return NextResponse.json(
        { error: 'SMTP not configured. Add SMTP_HOST, SMTP_USER, SMTP_PASS to .env.local' },
        { status: 500 },
      );
    }

    const sheets = await getSheetsClient();

    // All four sheets in a single round trip
    const [surveyValues, recipientValues, contactValues, templateValues] =
      await batchGetValues(sheets, spreadsheetId, [
        'Surveys!A:Z',
        'Survey Recipients!A:Z',
        'Survey Contacts!A:Z',
        EMAIL_TEMPLATE_RANGE,
      ]);

    // --- Survey metadata ---
    const surveyRows = surveyValues || [];
    if (surveyRows.length < 2) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }
    const sHeaders = surveyRows[0];
    const sIdCol = sHeaders.indexOf('survey_id');
    const sNameCol = sHeaders.indexOf('name');
    const sCategoryCol = sHeaders.indexOf('category');
    const sDeadlineCol = sHeaders.indexOf('deadline');

    const surveyRow = surveyRows.slice(1).find((r) => r[sIdCol] === surveyId);
    if (!surveyRow) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }
    const surveyName = surveyRow[sNameCol] || 'Survey';
    const surveyCategory = surveyRow[sCategoryCol] || '';
    const surveyDeadline = surveyRow[sDeadlineCol] || '';

    // --- Email copy: stored per survey, overridden by anything sent inline ---
    const stored = parseTemplates(templateValues, surveyId);
    const templates: Record<EmailVariant, EmailTemplate> = {
      first: templateOverride?.first || stored.first.template,
      reminder: templateOverride?.reminder || stored.reminder.template,
    };

    // --- Contacts lookup ---
    const contactRows = contactValues || [];
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

    // --- Recipients ---
    const recipientRows = recipientValues || [];
    // A test send only needs a recipient to borrow sample values from, so it
    // stays available before the recipient list has been imported.
    if (!isTestSend && recipientRows.length < 2) {
      return NextResponse.json({ error: 'No recipients found' }, { status: 404 });
    }

    const rHeaders = recipientRows[0] || [];
    const rIdCol = rHeaders.indexOf('recipient_id');
    const rSurveyIdCol = rHeaders.indexOf('survey_id');
    const rFirmCol = rHeaders.indexOf('firm_name');
    const rTokenCol = rHeaders.indexOf('token');
    const rStatusCol = rHeaders.indexOf('status');
    const rSentAtCol = rHeaders.indexOf('sent_at');
    const rRemindedAtCol = rHeaders.indexOf('reminded_at');

    // Build list of rows to email
    interface TargetRow {
      sheetRowIndex: number; // 1-indexed
      recipientId: string;
      firmName: string;
      token: string;
      currentStatus: string;
      variant: EmailVariant;
    }
    const targets: TargetRow[] = [];

    for (let i = 1; i < recipientRows.length; i++) {
      const row = recipientRows[i];
      if (row[rSurveyIdCol] !== surveyId) continue;
      if (row[rStatusCol] === 'completed') continue;
      if (!all && recipientIds && !recipientIds.includes(row[rIdCol])) continue;
      const variant = variantForStatus(row[rStatusCol] || '');
      // Honors the caller's first/reminder choice on both the "all" and the
      // explicit-recipientIds paths, so a reminders-only send can't quietly
      // fire a first invitation at a firm that was only selected by checkbox.
      if (!variants.includes(variant)) continue;
      targets.push({
        sheetRowIndex: i + 1,
        recipientId: row[rIdCol] || '',
        firmName: row[rFirmCol] || '',
        token: row[rTokenCol] || '',
        currentStatus: row[rStatusCol] || '',
        variant,
      });
    }

    // --- Nodemailer transport ---
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    console.log(
      `[email] SMTP transport: host=${smtpHost} port=${smtpPort} user=${smtpUser} from=${smtpFrom} ` +
        `variants=${variants.join(',')} targets=${targets.length}${isTestSend ? ' (test)' : ''}`,
    );

    try {
      await transporter.verify();
      console.log('[email] SMTP transporter verified');
    } catch (err: any) {
      console.error('[email] SMTP verify failed:', err?.message, err?.code, err?.response);
      return NextResponse.json(
        { error: `SMTP connection/auth failed: ${err?.message}` },
        { status: 502 },
      );
    }

    // --- Test send: one message, no sheet writes ---
    if (isTestSend) {
      const variant = variants[0];
      const sample = targets[0];
      const sampleContact = sample ? (contactsByFirm[sample.firmName] || [])[0] : undefined;

      const rendered = renderInvitationEmail({
        template: templates[variant],
        variant,
        vars: {
          contact_name: sampleContact?.contactName || 'Sample Contact',
          firm_name: sample?.firmName || 'Sample Firm',
          survey_name: surveyName,
          deadline: surveyDeadline,
          survey_url: `${appUrl}/surveys/${sample?.token || 'sample-token'}`,
        },
        appUrl,
      });

      await transporter.sendMail({
        from: smtpFrom,
        to: testTo!.trim(),
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      console.log(`[email] Test ${variant} email sent to ${testTo!.trim()} (no rows updated)`);
      return NextResponse.json({
        test: true,
        variant,
        sentTo: testTo!.trim(),
        subject: rendered.subject,
        usedSampleData: !sample,
      });
    }

    // Persist before sending so the copy survives an SMTP failure mid-batch.
    if (shouldSaveTemplate && templateOverride) {
      for (const variant of variants) {
        const candidate = templateOverride[variant];
        if (!candidate) continue;
        await saveTemplate(sheets, spreadsheetId, surveyId, variant, candidate);
        console.log(`[email] Saved ${variant} template for survey ${surveyId}`);
      }
    }

    let sent = 0;
    let reminded = 0;
    let skipped = 0;
    const errors: string[] = [];
    const now = new Date().toISOString();

    for (const target of targets) {
      const contacts = contactsByFirm[target.firmName] || [];
      if (contacts.length === 0) {
        console.warn(`[email] No contacts for firm "${target.firmName}" — skipping`);
        skipped++;
        continue;
      }

      const surveyUrl = `${appUrl}/surveys/${target.token}`;
      const isReminder = target.variant === 'reminder';
      let recipientSentOk = false;

      for (const contact of contacts) {
        if (!contact.contactEmail) continue;
        try {
          const rendered = renderInvitationEmail({
            template: templates[target.variant],
            variant: target.variant,
            vars: {
              contact_name: contact.contactName,
              firm_name: target.firmName,
              survey_name: surveyName,
              deadline: surveyDeadline,
              survey_url: surveyUrl,
            },
            appUrl,
          });

          const info = await transporter.sendMail({
            from: smtpFrom,
            to: contact.contactEmail,
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
          });
          console.log(
            `[email] Sent to ${contact.contactEmail} (firm=${target.firmName}) messageId=${info.messageId} response=${info.response}`,
          );
          recipientSentOk = true;
        } catch (err: any) {
          console.error(
            `[email] Send failed for ${contact.contactEmail} (firm=${target.firmName}):`,
            err?.message,
            err?.code,
            err?.response,
          );
          errors.push(`${target.firmName} / ${contact.contactEmail}: ${err.message}`);
        }
      }

      if (recipientSentOk) {
        // If the recipient was already sent/reminded, treat this send as a reminder:
        // update status to 'reminded' and APPEND to reminded_at history (pipe-
        // separated ISO timestamps), leaving sent_at untouched.
        // Otherwise (first send), set status to 'sent' and sent_at.
        const newStatus = isReminder ? 'reminded' : 'sent';
        const timestampCol = isReminder ? rRemindedAtCol : rSentAtCol;

        let newTimestampValue = now;
        if (isReminder && rRemindedAtCol !== -1) {
          // sheetRowIndex is 1-indexed; the recipientRows snapshot from
          // earlier in this request has the same indexing offset.
          const prior = recipientRows[target.sheetRowIndex - 1];
          const existing = (prior?.[rRemindedAtCol] || '').trim();
          newTimestampValue = existing ? `${existing}|${now}` : now;
        }

        const updates: Promise<any>[] = [];
        if (rStatusCol !== -1) {
          updates.push(
            sheets.spreadsheets.values.update({
              spreadsheetId,
              range: `Survey Recipients!${columnLetter(rStatusCol)}${target.sheetRowIndex}`,
              valueInputOption: 'USER_ENTERED',
              requestBody: { values: [[newStatus]] },
            }),
          );
        }
        if (timestampCol !== -1) {
          updates.push(
            sheets.spreadsheets.values.update({
              spreadsheetId,
              range: `Survey Recipients!${columnLetter(timestampCol)}${target.sheetRowIndex}`,
              valueInputOption: 'USER_ENTERED',
              requestBody: { values: [[newTimestampValue]] },
            }),
          );
        }
        await Promise.all(updates);
        console.log(
          `[email] Marked firm "${target.firmName}" as ${newStatus} (prior status="${target.currentStatus}")`,
        );
        if (isReminder) reminded++;
        else sent++;
      } else {
        skipped++;
      }
    }

    console.log(
      `[email] Done: sent=${sent} reminded=${reminded} skipped=${skipped} errors=${errors.length}`,
    );
    return NextResponse.json({ sent, reminded, skipped, errors });
  } catch (error: any) {
    console.error('Error sending survey emails:', error);
    return NextResponse.json(
      { error: 'Failed to send emails' },
      { status: 500 },
    );
  }
}
