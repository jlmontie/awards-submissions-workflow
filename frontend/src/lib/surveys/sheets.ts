/**
 * Single source of truth for Google Sheet tab names used by the survey
 * subsystem. Per-template response tabs let each survey type own its own
 * column schema without cross-contamination.
 */

export const SURVEYS_TAB = 'Surveys';
export const SURVEY_RECIPIENTS_TAB = 'Survey Recipients';
export const SURVEY_CONTACTS_TAB = 'Survey Contacts';

/**
 * Map of templateId → response sheet tab name. Add a new entry here when
 * onboarding a new survey template.
 */
export const RESPONSE_TABS: Record<string, string> = {
  architects: 'Survey Responses - Architects',
  contractors: 'Survey Responses - Contractors',
};

export function responseTabFor(templateId: string): string {
  const tab = RESPONSE_TABS[templateId];
  if (!tab) {
    throw new Error(`Unknown survey templateId: ${templateId}`);
  }
  return tab;
}
