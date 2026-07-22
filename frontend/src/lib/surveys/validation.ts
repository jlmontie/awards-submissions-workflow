import type { SurveyField, SurveyTemplate } from './templates';

export interface ValidationErrors {
  [fieldKey: string]: string;
}

/**
 * Revenue is entered in *millions*, so a plausible entry sits in the tens or
 * hundreds — occasionally into the tens of thousands for a multi-billion-dollar
 * firm (a $10.9B respondent = 10,900). This is NOT a cap on how large revenue
 * may be; it only catches the common mistake of typing raw dollars into a
 * millions field (e.g. 47,500,000 instead of 47.50). Any dollars-entry of a
 * firm earning even ~$1M lands at 1,000,000+ here — three orders of magnitude
 * above any real millions figure — so the guard sits at $1T-in-millions: high
 * enough that no genuine submission trips it, low enough to flag every
 * raw-dollars entry. Single source of truth for both the per-section and the
 * final submit validation.
 */
export const RAW_DOLLARS_THRESHOLD_MILLIONS = 1_000_000;

/**
 * Validate a single field's value against its type rules.
 * Returns an error message, or `null` when the value is acceptable.
 *
 * This is the one place field-level rules live — both the whole-survey
 * validation below and the per-section validation in SurveyForm call it, so the
 * two can't drift.
 */
export function validateField(
  field: SurveyField,
  value: string | boolean | undefined,
): string | null {
  // Required check
  if (field.required && !value) {
    return 'This field is required';
  }

  // Skip further validation if empty and not required
  if (!value) return null;

  const strValue = String(value).trim();
  if (field.required && strValue === '') {
    return 'This field is required';
  }
  if (!strValue) return null;

  switch (field.type) {
    case 'email':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strValue)) {
        return 'Enter a valid email address';
      }
      break;
    case 'number':
      if (isNaN(Number(strValue))) {
        return 'Enter a valid number';
      }
      break;
    case 'currency': {
      // Allow numbers with optional $ and commas
      const raw = strValue.replace(/[$,]/g, '');
      const num = Number(raw);
      if (isNaN(num)) {
        return 'Enter a valid dollar amount';
      } else if (num > RAW_DOLLARS_THRESHOLD_MILLIONS) {
        return 'Enter revenue in millions (e.g., 47.50, not 47,500,000)';
      } else if (!/^\d+\.\d{2}$/.test(raw)) {
        // Two decimal places required so ties at the hundreds-of-K place
        // resolve in the ranking export.
        return 'Enter a number that includes two decimal places (e.g., 47.50 OR 250.00)';
      }
      break;
    }
    case 'percent': {
      const num = Number(strValue.replace(/%/g, ''));
      if (isNaN(num) || num < 0 || num > 100) {
        return 'Enter a value between 0 and 100';
      } else if (!Number.isInteger(num)) {
        return 'Enter a whole number (no decimals)';
      }
      break;
    }
  }

  return null;
}

/**
 * Validate survey form data against a template.
 * Returns an object with field keys mapped to error messages.
 * Empty object = valid.
 */
export function validateSurvey(
  template: SurveyTemplate,
  data: Record<string, string | boolean>,
): ValidationErrors {
  const errors: ValidationErrors = {};

  for (const section of template.sections) {
    for (const field of section.fields) {
      // Skip hidden fields
      if (field.hideWhen && data[field.hideWhen]) {
        continue;
      }

      const error = validateField(field, data[field.key]);
      if (error) {
        errors[field.key] = error;
      }
    }

    // Percentage group sum check — must total exactly 100%
    if (section.type === 'percentage_group') {
      const sum = section.fields
        .filter((f) => f.type === 'percent')
        .reduce((acc, field) => {
          const val = data[field.key];
          if (!val) return acc;
          const num = Number(String(val).replace(/%/g, ''));
          return acc + (isNaN(num) ? 0 : num);
        }, 0);

      if (sum > 0 && sum !== 100) {
        errors['_percentage_group'] = `Market segments total ${sum}%. They must add up to exactly 100%.`;
      }
    }

    // Disciplines group: exactly one discipline must be selected
    if (section.type === 'disciplines_group') {
      const anyChecked = section.fields.some((field) => !!data[field.key]);
      if (!anyChecked) {
        errors['_disciplines_group'] = 'Select one discipline.';
      }
    }
  }

  return errors;
}
