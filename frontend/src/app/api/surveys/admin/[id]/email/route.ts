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

function buildSubject(
  surveyName: string,
  deadline: string,
  isReminder: boolean,
): string {
  if (isReminder) {
    return deadline
      ? `Reminder: ${surveyName} — Survey Closes ${deadline}`
      : `Reminder: ${surveyName} — Please Complete Your Survey`;
  }
  return `${surveyName} — Please Complete Your Survey`;
}

function buildHtml(
  contactName: string,
  firmName: string,
  surveyName: string,
  deadline: string,
  surveyUrl: string,
  appUrl: string,
  isReminder: boolean,
): string {
  let deadlineText: string;
  if (!deadline) {
    deadlineText = 'Please complete the survey at your earliest convenience.';
  } else if (isReminder) {
    deadlineText = `The survey closes on <strong>${deadline}</strong> — please submit your response before then.`;
  } else {
    deadlineText = `Please complete the survey by <strong>${deadline}</strong>.`;
  }

  const greeting = isReminder ? `Hi ${contactName},` : `Dear ${contactName},`;

  const introHtml = isReminder
    ? `This is a quick reminder that we haven&rsquo;t yet received your response to the <strong>${surveyName}</strong>.
                Your input on behalf of <strong>${firmName}</strong> is important to us &mdash; completing the survey only takes a few minutes.`
    : `We invite you to participate in the <strong>${surveyName}</strong>.
                You are receiving this message as one of the contacts for <strong>${firmName}</strong>.`;

  const closingHtml = isReminder
    ? 'Thanks for taking the time to respond.'
    : 'Thanks again for your consideration and support.';

  // Logo served by Next.js out of frontend/public; same image as the survey
  // header so the email matches the survey's branding. The text alt fallback
  // ("UC+D") shows in clients that block remote images.
  const logoUrl = `${appUrl.replace(/\/$/, '')}/ucd-logo.png`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light only" />
  <title>${surveyName}</title>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700&family=Roboto:wght@400;500&display=swap" rel="stylesheet" />
  <style>
    /* Tell clients we're a light-only design. Apple Mail/Outlook respect this. */
    :root {
      color-scheme: light only;
      supported-color-schemes: light only;
    }
    /* Belt-and-suspenders: if a client still applies a dark-mode pass, force
       the brand navy + yellow back onto the bands they live on. Without this
       the navy footer turns near-white while the yellow text stays yellow,
       which becomes illegible. */
    @media (prefers-color-scheme: dark) {
      .ucd-bg-navy { background-color: #2C3E48 !important; }
      .ucd-text-yellow { color: #F5CF00 !important; }
    }
    /* Outlook 365 dark-mode attribute selectors (separate from prefers-color-scheme). */
    [data-ogsc] .ucd-bg-navy,
    [data-ogsb] .ucd-bg-navy { background-color: #2C3E48 !important; }
    [data-ogsc] .ucd-text-yellow,
    [data-ogsb] .ucd-text-yellow { color: #F5CF00 !important; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:6px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td class="ucd-bg-navy" style="background-color:#2C3E48;padding:24px 32px;text-align:center;">
              <img src="${logoUrl}" alt="UC+D" height="48" class="ucd-text-yellow" style="height:48px;width:auto;display:inline-block;border:0;outline:none;text-decoration:none;color:#F5CF00;font-family:Montserrat,Arial,sans-serif;font-size:22px;font-weight:700;letter-spacing:1px;" />
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;color:#333333;font-size:15px;line-height:1.6;">
              <p style="margin:0 0 16px 0;">${greeting}</p>
              <p style="margin:0 0 16px 0;">
                ${introHtml}
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

              <p style="margin:0 0 16px 0;">${closingHtml}</p>
              <p style="margin:0 0 24px 0;">
                If you have any questions don&rsquo;t hesitate to reach out to me.
              </p>

              <!-- Signature -->
              <p style="margin:0 0 4px 0;font-family:Montserrat,Arial,sans-serif;font-weight:700;color:#2C3E48;">Ladd Marshall</p>
              <p style="margin:0 0 4px 0;color:#666666;font-size:14px;font-style:italic;">Utah Construction + Design</p>
              <p style="margin:0 0 4px 0;color:#666666;font-size:14px;">
                M: <a href="tel:+18018723531" style="color:#666666;text-decoration:none;">801-872-3531</a>
              </p>
              <p style="margin:0 0 4px 0;font-size:14px;">
                <a href="mailto:lmarshall@utahcdmag.com" style="color:#2C3E48;text-decoration:none;">lmarshall@utahcdmag.com</a>
              </p>
              <p style="margin:0;font-size:14px;">
                <a href="https://www.utahcdmag.com" style="color:#2C3E48;text-decoration:none;">www.utahcdmag.com</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="ucd-bg-navy" style="background-color:#2C3E48;padding:20px 32px;text-align:center;">
              <p class="ucd-text-yellow" style="margin:0;font-family:Montserrat,Arial,sans-serif;font-size:13px;color:#F5CF00;font-weight:600;font-style:italic;">Utah Construction + Design</p>
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
  isReminder: boolean,
): string {
  let deadlineText: string;
  if (!deadline) {
    deadlineText = 'Please complete the survey at your earliest convenience.';
  } else if (isReminder) {
    deadlineText = `The survey closes on ${deadline} — please submit your response before then.`;
  } else {
    deadlineText = `Please complete the survey by ${deadline}.`;
  }

  const greeting = isReminder ? `Hi ${contactName},` : `Dear ${contactName},`;

  const intro = isReminder
    ? `This is a quick reminder that we haven't yet received your response to the ${surveyName}. Your input on behalf of ${firmName} is important to us — completing the survey only takes a few minutes.`
    : `We invite you to participate in the ${surveyName}. You are receiving this message as one of the contacts for ${firmName}.`;

  const closing = isReminder
    ? 'Thanks for taking the time to respond.'
    : 'Thanks again for your consideration and support.';

  return [
    greeting,
    '',
    intro,
    '',
    deadlineText,
    '',
    'Complete your survey here:',
    surveyUrl,
    '',
    closing,
    '',
    "If you have any questions don't hesitate to reach out to me.",
    '',
    'Ladd Marshall',
    'Utah Construction + Design',
    'M: 801-872-3531',
    'lmarshall@utahcdmag.com',
    'www.utahcdmag.com',
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

    // --- Contacts lookup ---
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
        currentStatus: row[rStatusCol] || '',
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
      `[email] SMTP transport: host=${smtpHost} port=${smtpPort} user=${smtpUser} from=${smtpFrom} targets=${targets.length}`,
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
      const isReminder =
        target.currentStatus === 'sent' || target.currentStatus === 'reminded';
      let recipientSentOk = false;

      for (const contact of contacts) {
        if (!contact.contactEmail) continue;
        try {
          const info = await transporter.sendMail({
            from: smtpFrom,
            to: contact.contactEmail,
            subject: buildSubject(surveyName, surveyDeadline, isReminder),
            html: buildHtml(contact.contactName, target.firmName, surveyName, surveyDeadline, surveyUrl, appUrl, isReminder),
            text: buildText(contact.contactName, target.firmName, surveyName, surveyDeadline, surveyUrl, isReminder),
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
