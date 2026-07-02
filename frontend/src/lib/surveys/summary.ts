import type { SurveyTemplate } from './templates';
import { resolveLabel } from './templates';

export interface SummaryItem {
  label: string;
  value: string;
}

export interface SummarySection {
  title: string;
  items: SummaryItem[];
}

/**
 * Format a single field's stored value for display, mirroring the review
 * screen and confirmation page exactly (checkbox → Yes/No, currency → $XM,
 * percent → X%, empty → em dash).
 */
export function formatFieldValue(
  field: SurveyTemplate['sections'][number]['fields'][number],
  raw: string | boolean | undefined,
): string {
  if (field.type === 'checkbox') {
    return raw ? 'Yes' : 'No';
  }
  if (raw === undefined || raw === '' || raw === false) {
    return '—';
  }
  if (field.type === 'currency') {
    return `$${raw}M`;
  }
  if (field.type === 'percent') {
    return `${raw}%`;
  }
  return String(raw);
}

/**
 * Build a display-ready summary of a submission: one entry per section, each
 * with resolved field labels and formatted values. Fields hidden by an active
 * `hideWhen` (e.g. revenue fields when "Decline to Disclose" is checked) are
 * omitted, matching what the respondent saw on screen.
 *
 * Pure and dependency-free so it can be shared by the confirmation page
 * (client), the PDF generator, and the email body (server).
 */
export function buildSubmissionSummary(
  template: SurveyTemplate,
  data: Record<string, string | boolean>,
  surveyYear: number,
): SummarySection[] {
  return template.sections.map((section) => ({
    title: section.title,
    items: section.fields
      .filter((field) => !(field.hideWhen && data[field.hideWhen]))
      .map((field) => ({
        label: resolveLabel(field.label, surveyYear),
        value: formatFieldValue(field, data[field.key]),
      })),
  }));
}
