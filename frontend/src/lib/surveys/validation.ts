import type { SurveyTemplate } from './templates';

export interface ValidationErrors {
  [fieldKey: string]: string;
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
      const value = data[field.key];

      // Skip hidden fields
      if (field.hideWhen && data[field.hideWhen]) {
        continue;
      }

      // Required check
      if (field.required && !value) {
        errors[field.key] = 'This field is required';
        continue;
      }

      // Skip further validation if empty and not required
      if (!value) continue;

      const strValue = String(value).trim();
      if (field.required && strValue === '') {
        errors[field.key] = 'This field is required';
        continue;
      }

      // Type-specific validation
      switch (field.type) {
        case 'email':
          if (strValue && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strValue)) {
            errors[field.key] = 'Enter a valid email address';
          }
          break;
        case 'number':
          if (strValue && isNaN(Number(strValue))) {
            errors[field.key] = 'Enter a valid number';
          }
          break;
        case 'currency': {
          // Allow numbers with optional $ and commas
          const raw = strValue.replace(/[$,]/g, '');
          const num = Number(raw);
          if (strValue && isNaN(num)) {
            errors[field.key] = 'Enter a valid dollar amount';
          } else if (strValue && num > 10000) {
            // Revenue is entered in millions — anything over 10,000 (= $10B) is
            // almost certainly a value entered in raw dollars instead.
            errors[field.key] = 'Enter revenue in millions (e.g., 47.50, not 47,500,000)';
          } else if (strValue && !/^\d+\.\d{2}$/.test(raw)) {
            // Two decimal places required so ties at the hundreds-of-K place
            // resolve in the ranking export.
            errors[field.key] = 'Enter exactly two decimal places (e.g., 47.50)';
          }
          break;
        }
        case 'percent':
          if (strValue) {
            const num = Number(strValue.replace(/%/g, ''));
            if (isNaN(num) || num < 0 || num > 100) {
              errors[field.key] = 'Enter a value between 0 and 100';
            } else if (!Number.isInteger(num)) {
              errors[field.key] = 'Enter a whole number (no decimals)';
            }
          }
          break;
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
