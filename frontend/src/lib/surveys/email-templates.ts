/**
 * Persistence for per-survey invitation/reminder email copy.
 *
 * Stored in a `Survey Email Templates` tab, one row per (survey_id, variant).
 * A survey with no row renders from DEFAULT_TEMPLATES, so this tab is optional
 * — nothing breaks if it doesn't exist, and it's created on first save.
 */

import { batchGetValues, type SheetsClient } from '@/lib/google-sheets';
import {
  DEFAULT_TEMPLATES,
  EMAIL_VARIANTS,
  type EmailTemplate,
  type EmailVariant,
} from './invitation-email';

export const EMAIL_TEMPLATE_SHEET = 'Survey Email Templates';
export const EMAIL_TEMPLATE_RANGE = `${EMAIL_TEMPLATE_SHEET}!A:H`;

const HEADERS = [
  'survey_id',
  'variant',
  'subject',
  'greeting',
  'intro',
  'deadline_text',
  'closing',
  'updated_at',
] as const;

export interface StoredTemplate {
  template: EmailTemplate;
  /** False when this is the shipped default rather than saved copy. */
  isCustom: boolean;
  /** ISO timestamp of the last save; empty for defaults. */
  updatedAt: string;
}

export type TemplateSet = Record<EmailVariant, StoredTemplate>;

function defaultsFor(variant: EmailVariant): StoredTemplate {
  return { template: { ...DEFAULT_TEMPLATES[variant] }, isCustom: false, updatedAt: '' };
}

function emptyTemplateSet(): TemplateSet {
  return {
    first: defaultsFor('first'),
    reminder: defaultsFor('reminder'),
  };
}

/**
 * Build the template set for one survey from raw sheet rows.
 *
 * `rows` is null when the tab doesn't exist and empty when it exists but is
 * unpopulated; both mean "no customization", so both fall back to defaults.
 * Kept separate from the fetch so the email route can fold this tab into its
 * existing batchGet rather than paying for a second round trip.
 */
export function parseTemplates(rows: string[][] | null, surveyId: string): TemplateSet {
  const result = emptyTemplateSet();
  if (!rows || rows.length < 2) return result;

  const headers = rows[0];
  const col = (name: string) => headers.indexOf(name);
  const surveyIdCol = col('survey_id');
  const variantCol = col('variant');
  if (surveyIdCol === -1 || variantCol === -1) return result;

  const subjectCol = col('subject');
  const greetingCol = col('greeting');
  const introCol = col('intro');
  const deadlineCol = col('deadline_text');
  const closingCol = col('closing');
  const updatedCol = col('updated_at');

  for (const row of rows.slice(1)) {
    if (row[surveyIdCol] !== surveyId) continue;
    const variant = (row[variantCol] || '').trim() as EmailVariant;
    if (!EMAIL_VARIANTS.includes(variant)) continue;

    const at = (index: number) => (index === -1 ? '' : row[index] || '');
    const fallback = DEFAULT_TEMPLATES[variant];

    result[variant] = {
      // A blank cell falls back to the shipped copy for that slot rather than
      // sending an email with a hole in it. deadline_text is the exception:
      // blank there is a deliberate "omit this paragraph", so it's preserved.
      template: {
        subject: at(subjectCol) || fallback.subject,
        greeting: at(greetingCol) || fallback.greeting,
        intro: at(introCol) || fallback.intro,
        deadlineText: deadlineCol === -1 ? fallback.deadlineText : row[deadlineCol] || '',
        closing: at(closingCol) || fallback.closing,
      },
      isCustom: true,
      updatedAt: at(updatedCol),
    };
  }

  return result;
}

/** Read the stored templates for one survey. */
export async function loadTemplates(
  sheets: SheetsClient,
  spreadsheetId: string,
  surveyId: string,
): Promise<TemplateSet> {
  const [rows] = await batchGetValues(sheets, spreadsheetId, [EMAIL_TEMPLATE_RANGE]);
  return parseTemplates(rows, surveyId);
}

/**
 * Find the 1-indexed sheet row holding one (survey_id, variant), or -1.
 * Returns -1 when the tab is missing, headerless, or has no matching row.
 */
async function findTemplateRow(
  sheets: SheetsClient,
  spreadsheetId: string,
  surveyId: string,
  variant: EmailVariant,
): Promise<number> {
  const [rows] = await batchGetValues(sheets, spreadsheetId, [EMAIL_TEMPLATE_RANGE]);
  if (!rows || rows.length < 2) return -1;

  const headers = rows[0];
  const surveyIdCol = headers.indexOf('survey_id');
  const variantCol = headers.indexOf('variant');
  if (surveyIdCol === -1 || variantCol === -1) return -1;

  const index = rows
    .slice(1)
    .findIndex(
      (row) => row[surveyIdCol] === surveyId && (row[variantCol] || '').trim() === variant,
    );
  return index === -1 ? -1 : index + 2; // +1 for header, +1 for 1-indexing
}

/** Create the tab with its header row if it isn't there yet. */
async function ensureSheet(sheets: SheetsClient, spreadsheetId: string): Promise<void> {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title',
  });
  const exists = (meta.data.sheets || []).some(
    (sheet) => sheet.properties?.title === EMAIL_TEMPLATE_SHEET,
  );
  if (exists) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: EMAIL_TEMPLATE_SHEET } } }],
    },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${EMAIL_TEMPLATE_SHEET}!A1:H1`,
    valueInputOption: 'RAW',
    requestBody: { values: [[...HEADERS]] },
  });
}

/**
 * Upsert one (survey_id, variant) row.
 *
 * Writes are RAW rather than USER_ENTERED: copy beginning with `=`, `+` or `-`
 * would otherwise be parsed as a spreadsheet formula and come back as an error
 * value instead of the text that was typed.
 */
export async function saveTemplate(
  sheets: SheetsClient,
  spreadsheetId: string,
  surveyId: string,
  variant: EmailVariant,
  template: EmailTemplate,
): Promise<void> {
  await ensureSheet(sheets, spreadsheetId);

  const values = [
    surveyId,
    variant,
    template.subject,
    template.greeting,
    template.intro,
    template.deadlineText,
    template.closing,
    new Date().toISOString(),
  ];

  const targetRow = await findTemplateRow(sheets, spreadsheetId, surveyId, variant);

  if (targetRow === -1) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: EMAIL_TEMPLATE_RANGE,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [values] },
    });
    return;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${EMAIL_TEMPLATE_SHEET}!A${targetRow}:H${targetRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: [values] },
  });
}

/**
 * Drop a survey's saved copy for one variant, reverting it to the shipped
 * default. The row is cleared rather than deleted so no other row's index
 * shifts; parseTemplates skips rows with a blank variant cell, so a cleared
 * row reads back as "not customized".
 */
export async function deleteTemplate(
  sheets: SheetsClient,
  spreadsheetId: string,
  surveyId: string,
  variant: EmailVariant,
): Promise<boolean> {
  const targetRow = await findTemplateRow(sheets, spreadsheetId, surveyId, variant);
  if (targetRow === -1) return false;

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${EMAIL_TEMPLATE_SHEET}!A${targetRow}:H${targetRow}`,
  });
  return true;
}
