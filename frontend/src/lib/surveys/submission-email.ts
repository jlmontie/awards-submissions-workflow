import nodemailer from 'nodemailer';
import type { SummarySection } from './summary';

export interface SubmissionContact {
  name: string;
  email: string;
}

export interface SubmissionEmailContent {
  surveyName: string;
  firmName: string;
  /** ISO timestamp of the submission. */
  submittedAt: string;
  /** True when this reflects an edit rather than the first submission. */
  wasEdit: boolean;
  sections: SummarySection[];
}

/** Minimal HTML entity escaping for interpolated (user-supplied) values. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function buildSubmissionSubject(surveyName: string, wasEdit: boolean): string {
  return wasEdit
    ? `Your updated ${surveyName} submission`
    : `Your ${surveyName} submission — copy for your records`;
}

function sanitizeFilename(name: string): string {
  const base = (name || 'survey').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
  return `${base || 'survey'}-submission.pdf`;
}

export function submissionPdfFilename(firmName: string): string {
  return sanitizeFilename(firmName);
}

function summaryTablesHtml(sections: SummarySection[]): string {
  return sections
    .map((section) => {
      const rows = section.items
        .map(
          (item) => `
                <tr>
                  <td style="padding:6px 12px 6px 0;color:#555555;font-size:13px;vertical-align:top;width:45%;">${esc(item.label)}</td>
                  <td style="padding:6px 0;color:#111111;font-size:13px;vertical-align:top;">${esc(item.value)}</td>
                </tr>`,
        )
        .join('');
      return `
              <tr>
                <td style="padding:20px 0 6px 0;">
                  <p style="margin:0 0 6px 0;font-family:Montserrat,Arial,sans-serif;font-size:14px;font-weight:700;color:#2C3E48;border-bottom:1px solid #dddddd;padding-bottom:4px;">${esc(
                    section.title,
                  )}</p>
                  <table width="100%" cellpadding="0" cellspacing="0">${rows}
                  </table>
                </td>
              </tr>`;
    })
    .join('');
}

export function buildSubmissionEmailHtml(
  contactName: string,
  content: SubmissionEmailContent,
  appUrl: string,
): string {
  const { surveyName, firmName, submittedAt, wasEdit, sections } = content;
  const greeting = contactName ? `Hi ${esc(contactName)},` : 'Hi,';
  const logoUrl = `${appUrl.replace(/\/$/, '')}/ucd-logo.png`;

  const intro = wasEdit
    ? `Your submission for the <strong>${esc(surveyName)}</strong> on behalf of <strong>${esc(
        firmName,
      )}</strong> has been <strong>updated</strong>. A copy of your latest answers is included below and attached as a PDF for your records.`
    : `Thank you for completing the <strong>${esc(surveyName)}</strong> on behalf of <strong>${esc(
        firmName,
      )}</strong>. A copy of your submission is included below and attached as a PDF for your records.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light only" />
  <title>${esc(surveyName)}</title>
  <style>
    :root { color-scheme: light only; supported-color-schemes: light only; }
    @media (prefers-color-scheme: dark) {
      .ucd-bg-navy { background-color: #2C3E48 !important; }
      .ucd-text-yellow { color: #F5CF00 !important; }
    }
    [data-ogsc] .ucd-bg-navy, [data-ogsb] .ucd-bg-navy { background-color: #2C3E48 !important; }
    [data-ogsc] .ucd-text-yellow, [data-ogsb] .ucd-text-yellow { color: #F5CF00 !important; }
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
              <p style="margin:0 0 16px 0;">${intro}</p>
              <p style="margin:0 0 8px 0;font-size:13px;color:#666666;">Submitted ${esc(
                formatTimestamp(submittedAt),
              )}</p>

              <table width="100%" cellpadding="0" cellspacing="0">
                ${summaryTablesHtml(sections)}
              </table>

              <p style="margin:24px 0 0 0;font-size:13px;color:#666666;">
                Need to make a change? You can update your response any time before the survey closes using the link in your original invitation.
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

export function buildSubmissionEmailText(
  contactName: string,
  content: SubmissionEmailContent,
): string {
  const { surveyName, firmName, submittedAt, wasEdit, sections } = content;
  const lines: string[] = [];
  lines.push(contactName ? `Hi ${contactName},` : 'Hi,');
  lines.push('');
  lines.push(
    wasEdit
      ? `Your submission for the ${surveyName} on behalf of ${firmName} has been updated. A copy of your latest answers is below, and a PDF is attached for your records.`
      : `Thank you for completing the ${surveyName} on behalf of ${firmName}. A copy of your submission is below, and a PDF is attached for your records.`,
  );
  lines.push('');
  lines.push(`Submitted ${formatTimestamp(submittedAt)}`);
  lines.push('');
  for (const section of sections) {
    lines.push(section.title.toUpperCase());
    for (const item of section.items) {
      lines.push(`  ${item.label}: ${item.value}`);
    }
    lines.push('');
  }
  lines.push('Utah Construction + Design');
  return lines.join('\n');
}

export interface SendSubmissionResult {
  sent: number;
  skipped: number;
  errors: string[];
}

/**
 * Email a copy of the submission (with the PDF attached) to every provided
 * contact for the firm. Reads SMTP config from the environment; if SMTP is not
 * configured, returns without sending rather than throwing so a submission is
 * never blocked on email delivery. Individual send failures are collected in
 * `errors` and do not abort the batch.
 */
export async function sendSubmissionCopyEmails(
  contacts: SubmissionContact[],
  content: SubmissionEmailContent,
  pdf: Buffer,
): Promise<SendSubmissionResult> {
  const result: SendSubmissionResult = { sent: 0, skipped: 0, errors: [] };

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || smtpUser;
  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.warn('[submission-email] SMTP not configured — skipping submission copy email');
    result.skipped = contacts.length;
    return result;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const subject = buildSubmissionSubject(content.surveyName, content.wasEdit);
  const filename = submissionPdfFilename(content.firmName);

  for (const contact of contacts) {
    if (!contact.email) {
      result.skipped++;
      continue;
    }
    try {
      await transporter.sendMail({
        from: smtpFrom,
        to: contact.email,
        subject,
        html: buildSubmissionEmailHtml(contact.name, content, appUrl),
        text: buildSubmissionEmailText(contact.name, content),
        attachments: [{ filename, content: pdf, contentType: 'application/pdf' }],
      });
      result.sent++;
    } catch (err: any) {
      console.error(
        `[submission-email] Send failed for ${contact.email} (firm=${content.firmName}):`,
        err?.message,
      );
      result.errors.push(`${contact.email}: ${err?.message || 'send failed'}`);
    }
  }

  return result;
}
