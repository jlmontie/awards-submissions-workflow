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
      if (field.required && !value && value !== 0) {
        errors[field.key] = 'This field is required';
        continue;
      }

      // Skip further validation if empty and not required
      if (!value && value !== 0) continue;

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
        case 'currency':
          // Allow numbers with optional $ and commas
          if (strValue && isNaN(Number(strValue.replace(/[$,]/g, '')))) {
            errors[field.key] = 'Enter a valid dollar amount';
          }
          break;
        case 'percent':
          if (strValue) {
            const num = Number(strValue.replace(/%/g, ''));
            if (isNaN(num) || num < 0 || num > 100) {
              errors[field.key] = 'Enter a value between 0 and 100';
            }
          }
          break;
      }
    }

    // Percentage group sum check
    if (section.type === 'percentage_group') {
      const sum = section.fields.reduce((acc, field) => {
        const val = data[field.key];
        if (!val) return acc;
        const num = Number(String(val).replace(/%/g, ''));
        return acc + (isNaN(num) ? 0 : num);
      }, 0);

      if (sum > 0 && Math.abs(sum - 100) > 0.5) {
        errors['_percentage_group'] = `Market segments total ${sum}%. They should add up to 100%.`;
      }
    }
  }

  return errors;
}
