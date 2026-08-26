import { describe, it, expect } from 'vitest';
import { surveyTemplates } from '../templates';
import type { SurveyTemplate } from '../templates';
import { ARCHITECT_RESPONSE_COLUMNS } from './architects';
import { CONTRACTOR_RESPONSE_COLUMNS } from './contractors';
import { ENGINEER_RESPONSE_COLUMNS } from './engineers';

/**
 * A template field that isn't in its response-column list never reaches the
 * sheet, and a response column with no matching field is a dead column that
 * silently shifts every column after it when someone edits the row builder.
 * Neither failure surfaces at runtime — the write succeeds either way — so it
 * is pinned here instead.
 */

// Written by the responses route from the row context, not from form data.
const METADATA_COLUMNS = [
  'response_id', 'survey_id', 'recipient_id', 'token', 'submitted_at',
];

const CASES: [string, string[]][] = [
  ['architects', ARCHITECT_RESPONSE_COLUMNS],
  ['contractors', CONTRACTOR_RESPONSE_COLUMNS],
  ['engineers', ENGINEER_RESPONSE_COLUMNS],
];

function fieldKeys(template: SurveyTemplate): string[] {
  return template.sections.flatMap((s) => s.fields.map((f) => f.key));
}

describe.each(CASES)('%s response columns', (templateId, columns) => {
  const template = surveyTemplates[templateId];

  it('is registered in surveyTemplates', () => {
    expect(template).toBeDefined();
    expect(template.id).toBe(templateId);
  });

  it('starts with the metadata columns in order', () => {
    expect(columns.slice(0, METADATA_COLUMNS.length)).toEqual(METADATA_COLUMNS);
  });

  it('has no duplicate columns', () => {
    expect(new Set(columns).size).toBe(columns.length);
  });

  it('covers every template field', () => {
    const missing = fieldKeys(template).filter((k) => !columns.includes(k));
    expect(missing).toEqual([]);
  });

  it('has no column without a template field', () => {
    const keys = new Set(fieldKeys(template));
    const orphans = columns
      .filter((c) => !METADATA_COLUMNS.includes(c))
      .filter((c) => !keys.has(c));
    expect(orphans).toEqual([]);
  });
});
