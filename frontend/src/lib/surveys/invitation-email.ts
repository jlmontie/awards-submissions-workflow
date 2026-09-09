/**
 * Survey invitation + reminder email rendering.
 *
 * The branded shell (logo header, CTA button, signature, navy footer, and the
 * dark-mode workarounds) lives here in code. Only five prose slots are
 * editable by an admin, per variant:
 *
 *   subject | greeting | intro | deadlineText | closing
 *
 * Slot source is plain text with a small markup subset, so a single edit
 * produces both the HTML and the text/plain part of the message and the two
 * cannot drift:
 *
 *   - `**bold**`   -> <strong>bold</strong> in HTML, markers stripped in text
 *   - a blank line -> a new <p> in HTML, preserved in text
 *   - `{{token}}`  -> substituted from TemplateVars, HTML-escaped
 *
 * Slot source is escaped before markup conversion, and token values are escaped
 * on substitution, so neither admin-authored copy nor sheet data (firm and
 * contact names) can inject markup into the message.
 */

export type EmailVariant = 'first' | 'reminder';

export const EMAIL_VARIANTS: readonly EmailVariant[] = ['first', 'reminder'] as const;

export interface EmailTemplate {
  subject: string;
  greeting: string;
  intro: string;
  deadlineText: string;
  closing: string;
}

export const TEMPLATE_SLOTS = [
  'subject',
  'greeting',
  'intro',
  'deadlineText',
  'closing',
] as const;
export type TemplateSlot = (typeof TEMPLATE_SLOTS)[number];

/** deadlineText may be blank (the paragraph is then omitted); the rest may not. */
const REQUIRED_SLOTS: readonly TemplateSlot[] = ['subject', 'greeting', 'intro', 'closing'];

export const TEMPLATE_TOKENS = [
  'contact_name',
  'firm_name',
  'survey_name',
  'deadline',
  'survey_url',
] as const;
export type TemplateToken = (typeof TEMPLATE_TOKENS)[number];

export type TemplateVars = Record<TemplateToken, string>;

/** Guard against a paste of an entire document into a slot. */
const MAX_SLOT_LENGTH = 4000;
const MAX_SUBJECT_LENGTH = 200;

/**
 * The copy this app shipped with, expressed in slot source form. A survey with
 * no row in the `Survey Email Templates` tab renders from these, so existing
 * surveys keep sending the same message until someone customizes one.
 */
export const DEFAULT_TEMPLATES: Record<EmailVariant, EmailTemplate> = {
  first: {
    subject: '{{survey_name}} — Please Complete Your Survey',
    greeting: 'Dear {{contact_name}},',
    intro:
      'We invite you to participate in the **{{survey_name}}**. You are receiving this message as one of the contacts for **{{firm_name}}**.',
    deadlineText: 'Please complete the survey by **{{deadline}}**.',
    closing: 'Thanks again for your consideration and support.',
  },
  reminder: {
    subject: 'Reminder: {{survey_name}} — Survey Closes {{deadline}}',
    greeting: 'Hi {{contact_name}},',
    intro:
      'This is a quick reminder that we haven’t yet received your response to the **{{survey_name}}**. Your input on behalf of **{{firm_name}}** is important to us — completing the survey only takes a few minutes.',
    deadlineText:
      'The survey closes on **{{deadline}}** — please submit your response before then.',
    closing: 'Thanks for taking the time to respond.',
  },
};

/**
 * Used per-slot when the survey has no deadline set but the slot's copy
 * references {{deadline}} — otherwise that slot renders a sentence with a hole
 * in it. Slots that don't mention the deadline are left alone.
 */
export const NO_DEADLINE_FALLBACK: Record<
  EmailVariant,
  Pick<EmailTemplate, 'subject' | 'deadlineText'>
> = {
  first: {
    subject: '{{survey_name}} — Please Complete Your Survey',
    deadlineText: 'Please complete the survey at your earliest convenience.',
  },
  reminder: {
    subject: 'Reminder: {{survey_name}} — Please Complete Your Survey',
    deadlineText: 'Please complete the survey at your earliest convenience.',
  },
};

// --- Slot rendering ---------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const TOKEN_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** Token names used by `source` that aren't in TEMPLATE_TOKENS. */
export function unknownTokens(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(TOKEN_RE)) {
    const name = match[1];
    if (!(TEMPLATE_TOKENS as readonly string[]).includes(name)) found.add(name);
  }
  return [...found];
}

export function referencesToken(source: string, token: TemplateToken): boolean {
  return [...source.matchAll(TOKEN_RE)].some((m) => m[1] === token);
}

function substitute(source: string, vars: TemplateVars, escapeValues: boolean): string {
  return source.replace(TOKEN_RE, (_full, name: string) => {
    const value = (vars as Record<string, string | undefined>)[name] ?? '';
    return escapeValues ? escapeHtml(value) : value;
  });
}

/**
 * Render one slot to HTML paragraphs.
 *
 * Escaping happens before markup conversion and token substitution, so `**` in
 * a firm name stays literal rather than opening a <strong>.
 */
function renderHtmlSlot(source: string, vars: TemplateVars, marginStyle: string): string {
  const escaped = escapeHtml(source);
  const bolded = escaped.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
  const substituted = substitute(bolded, vars, true);

  return substituted
    .split(/\n\s*\n/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p style="${marginStyle}">${para.replace(/\n/g, '<br />')}</p>`)
    .join('\n              ');
}

/** Render one slot to plain text. */
function renderTextSlot(source: string, vars: TemplateVars): string {
  const stripped = source.replace(/\*\*([\s\S]+?)\*\*/g, '$1');
  return substitute(stripped, vars, false).trim();
}

/** Render the subject: markup stripped, collapsed to a single line. */
function renderSubject(source: string, vars: TemplateVars): string {
  return renderTextSlot(source, vars).replace(/\s*\n\s*/g, ' ').trim();
}

// --- Validation -------------------------------------------------------------

/** Human-readable problems with a template. An empty array means it's valid. */
export function validateTemplate(template: Partial<EmailTemplate>): string[] {
  const errors: string[] = [];

  for (const slot of TEMPLATE_SLOTS) {
    const value = template[slot];
    if (value === undefined || value === null) {
      errors.push(`${slot} is missing.`);
      continue;
    }
    if (typeof value !== 'string') {
      errors.push(`${slot} must be text.`);
      continue;
    }
    if (REQUIRED_SLOTS.includes(slot) && !value.trim()) {
      errors.push(`${slot} cannot be empty.`);
    }
    const max = slot === 'subject' ? MAX_SUBJECT_LENGTH : MAX_SLOT_LENGTH;
    if (value.length > max) {
      errors.push(`${slot} is too long (${value.length} characters; limit ${max}).`);
    }
    const unknown = unknownTokens(value);
    if (unknown.length > 0) {
      errors.push(
        `${slot} uses unknown placeholder${unknown.length > 1 ? 's' : ''} ` +
          `${unknown.map((t) => `{{${t}}}`).join(', ')}. ` +
          `Available: ${TEMPLATE_TOKENS.map((t) => `{{${t}}}`).join(', ')}.`,
      );
    }
  }

  return errors;
}

// --- Message assembly -------------------------------------------------------

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Swap in the no-deadline fallback for any slot that references {{deadline}}
 * when the survey has no deadline set.
 */
export function applyDeadlineFallback(
  template: EmailTemplate,
  variant: EmailVariant,
  deadline: string,
): EmailTemplate {
  if (deadline.trim()) return template;

  const fallback = NO_DEADLINE_FALLBACK[variant];
  return {
    ...template,
    subject: referencesToken(template.subject, 'deadline') ? fallback.subject : template.subject,
    deadlineText: referencesToken(template.deadlineText, 'deadline')
      ? fallback.deadlineText
      : template.deadlineText,
  };
}

export function renderInvitationEmail(params: {
  template: EmailTemplate;
  variant: EmailVariant;
  vars: TemplateVars;
  appUrl: string;
}): RenderedEmail {
  const { variant, vars, appUrl } = params;
  const template = applyDeadlineFallback(params.template, variant, vars.deadline);

  return {
    subject: renderSubject(template.subject, vars),
    html: buildHtml(template, vars, appUrl),
    text: buildText(template, vars),
  };
}

function buildHtml(template: EmailTemplate, vars: TemplateVars, appUrl: string): string {
  const greetingHtml = renderHtmlSlot(template.greeting, vars, 'margin:0 0 16px 0;');
  const introHtml = renderHtmlSlot(template.intro, vars, 'margin:0 0 16px 0;');
  const deadlineHtml = renderHtmlSlot(template.deadlineText, vars, 'margin:0 0 24px 0;');
  const closingHtml = renderHtmlSlot(template.closing, vars, 'margin:0 0 16px 0;');

  const surveyUrl = escapeHtml(vars.survey_url);
  const surveyName = escapeHtml(vars.survey_name);

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
              ${greetingHtml}
              ${introHtml}
              ${deadlineHtml}

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

              ${closingHtml}
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

function buildText(template: EmailTemplate, vars: TemplateVars): string {
  const lines = [
    renderTextSlot(template.greeting, vars),
    '',
    renderTextSlot(template.intro, vars),
  ];

  const deadlineText = renderTextSlot(template.deadlineText, vars);
  if (deadlineText) lines.push('', deadlineText);

  lines.push(
    '',
    'Complete your survey here:',
    vars.survey_url,
    '',
    renderTextSlot(template.closing, vars),
    '',
    "If you have any questions don't hesitate to reach out to me.",
    '',
    'Ladd Marshall',
    'Utah Construction + Design',
    'M: 801-872-3531',
    'lmarshall@utahcdmag.com',
    'www.utahcdmag.com',
  );

  return lines.join('\n');
}

/**
 * Which email a recipient is due for, from its current status. A recipient
 * that has already been mailed gets the reminder copy; everyone else gets the
 * first invitation. Shared by the send and preview routes so the audience
 * split shown in the editor matches the one the send actually uses.
 */
export function variantForStatus(status: string): EmailVariant {
  return status === 'sent' || status === 'reminded' ? 'reminder' : 'first';
}
