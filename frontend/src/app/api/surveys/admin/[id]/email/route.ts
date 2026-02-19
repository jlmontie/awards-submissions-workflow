import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getSheetsClient } from '@/lib/google-sheets';

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

function buildHtml(
  contactName: string,
  firmName: string,
  surveyName: string,
  deadline: string,
  surveyUrl: string,
): string {
  const deadlineText = deadline
    ? `Please complete the survey by <strong>${deadline}</strong>.`
    : 'Please complete the survey at your earliest convenience.';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${surveyName}</title>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700&family=Roboto:wght@400;500&display=swap" rel="stylesheet" />
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:6px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:#2C3E48;padding:24px 32px;">
              <span style="font-family:Montserrat,Arial,sans-serif;font-size:22px;font-weight:700;color:#F5CF00;letter-spacing:1px;">UC+D</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;color:#333333;font-size:15px;line-height:1.6;">
              <p style="margin:0 0 16px 0;">Dear ${contactName},</p>
              <p style="margin:0 0 16px 0;">
                You are receiving this message on behalf of <strong>${firmName}</strong>. We invite you to participate in the
                <strong>${surveyName}</strong>.
              </p>
              <p style="margin:0 0 24px 0;">${deadlineText}</p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
                <tr>
                  <td style="border-radius:4px;background-color:#F5CF00;">
                    <a href="${surveyUrl}"
                       style="display:inline-block;padding:14px 32px;font-family:Montserrat,Arial,sans-serif;font-size:14px;font-weight:700;color:#000000;text-decoration:none;letter-spacing:0.5px;">
                      Complete Your Survey
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px 0;font-size:13px;color:#666666;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 24px 0;font-size:13px;color:#2C3E48;word-break:break-all;">
                <a href="${surveyUrl}" style="color:#2C3E48;">${surveyUrl}</a>
              </p>

              <p style="margin:0;font-size:13px;color:#888888;border-top:1px solid #eeeeee;padding-top:16px;">
                This link is unique to <strong>${firmName}</strong>. Please do not share it with others.
                If you have any questions, reply to this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#2C3E48;padding:20px 32px;">
              <p style="margin:0;font-family:Montserrat,Arial,sans-serif;font-size:13px;color:#F5CF00;font-weight:600;">UC+D Magazine</p>
              <p style="margin:4px 0 0 0;font-size:12px;color:#aaaaaa;">Urban Land &amp; Design | Awards &amp; Rankings</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildText(
  contactName: string,
  firmName: string,
  surveyName: string,
  deadline: string,
  surveyUrl: string,
): string {
  const deadlineText = deadline
    ? `Please complete the survey by ${deadline}.`
    : 'Please complete the survey at your earliest convenience.';

  return [
    `Dear ${contactName},`,
    '',
    `You are receiving this message on behalf of ${firmName}. We invite you to participate in the ${surveyName}.`,
    '',
    deadlineText,
    '',
    'Complete your survey here:',
    surveyUrl,
    '',
    `This link is unique to ${firmName}. Please do not share it with others.`,
    '',
    'UC+D Magazine | Urban Land & Design | Awards & Rankings',
  ].join('\n');
}

/**
 * POST /api/surveys/admin/[id]/email
 *
 * Send survey invitation emails to selected (or all non-completed) recipients.
 * Body: { recipientIds?: string[], all?: boolean }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const surveyId = params.id;
    const body = await request.json();
    const { recipientIds, all } = body as {
      recipientIds?: string[];
      all?: boolean;
    };

    if (!all && (!recipientIds || recipientIds.length === 0)) {
      return NextResponse.json(
        { error: 'Provide recipientIds or set all: true' },
        { status: 400 },
      );
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

    // Fetch all three sheets in parallel
    const [surveysRes, recipientsRes, contactsRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId, range: 'Surveys!A:Z' }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: 'Survey Recipients!A:Z' }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: 'Survey Contacts!A:Z' }),
    ]);

    // --- Survey metadata ---
    const surveyRows = surveysRes.data.values || [];
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

    // --- Contacts lookup (keyed by normalized firm name: trimmed lowercase) ---
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
        const firmKey = firmName.toLowerCase();
        if (category === surveyCategory && active === 'TRUE' && firmName) {
          if (!contactsByFirm[firmKey]) contactsByFirm[firmKey] = [];
          contactsByFirm[firmKey].push({
            contactName: row[cNameCol] || '',
            contactEmail: row[cEmailCol] || '',
          });
        }
      }
    }

    // --- Recipients ---
    const recipientRows = recipientsRes.data.values || [];
    if (recipientRows.length < 2) {
      return NextResponse.json({ error: 'No recipients found' }, { status: 404 });
    }

    const rHeaders = recipientRows[0];
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
    }
    const targets: TargetRow[] = [];

    for (let i = 1; i < recipientRows.length; i++) {
      const row = recipientRows[i];
      if (row[rSurveyIdCol] !== surveyId) continue;
      if (row[rStatusCol] === 'completed') continue;
      if (!all && !recipientIds!.includes(row[rIdCol])) continue;
      targets.push({
        sheetRowIndex: i + 1,
        recipientId: row[rIdCol] || '',
        firmName: row[rFirmCol] || '',
        token: row[rTokenCol] || '',
        currentStatus: row[rStatusCol] || 'pending',
      });
    }

    // --- Nodemailer transport ---
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];
    const now = new Date().toISOString();

    for (const target of targets) {
      const firmKey = target.firmName.trim().toLowerCase();
      const contacts = contactsByFirm[firmKey] || [];
      if (contacts.length === 0) {
        skipped++;
        continue;
      }

      const surveyUrl = `${appUrl}/surveys/${target.token}`;
      let recipientSentOk = false;

      for (const contact of contacts) {
        if (!contact.contactEmail) continue;
        try {
          await transporter.sendMail({
            from: smtpFrom,
            to: contact.contactEmail,
            subject: `${surveyName} — Please Complete Your Survey`,
            html: buildHtml(contact.contactName, target.firmName, surveyName, surveyDeadline, surveyUrl),
            text: buildText(contact.contactName, target.firmName, surveyName, surveyDeadline, surveyUrl),
          });
          recipientSentOk = true;
        } catch (err: any) {
          errors.push(`${target.firmName} / ${contact.contactEmail}: ${err.message}`);
        }
      }

      if (recipientSentOk) {
        // First send → status='sent' + sent_at; repeat send → status='reminded' + reminded_at
        const isReminder = target.currentStatus === 'sent' || target.currentStatus === 'reminded';
        const updates: Promise<any>[] = [];

        if (rStatusCol !== -1) {
          updates.push(
            sheets.spreadsheets.values.update({
              spreadsheetId,
              range: `Survey Recipients!${columnLetter(rStatusCol)}${target.sheetRowIndex}`,
              valueInputOption: 'USER_ENTERED',
              requestBody: { values: [[isReminder ? 'reminded' : 'sent']] },
            }),
          );
        }

        if (isReminder && rRemindedAtCol !== -1) {
          updates.push(
            sheets.spreadsheets.values.update({
              spreadsheetId,
              range: `Survey Recipients!${columnLetter(rRemindedAtCol)}${target.sheetRowIndex}`,
              valueInputOption: 'USER_ENTERED',
              requestBody: { values: [[now]] },
            }),
          );
        } else if (!isReminder && rSentAtCol !== -1) {
          updates.push(
            sheets.spreadsheets.values.update({
              spreadsheetId,
              range: `Survey Recipients!${columnLetter(rSentAtCol)}${target.sheetRowIndex}`,
              valueInputOption: 'USER_ENTERED',
              requestBody: { values: [[now]] },
            }),
          );
        }

        await Promise.all(updates);
        sent++;
      } else {
        skipped++;
      }
    }

    return NextResponse.json({ sent, skipped, errors });
  } catch (error: any) {
    console.error('Error sending survey emails:', error);
    return NextResponse.json(
      { error: 'Failed to send emails' },
      { status: 500 },
    );
  }
}
