import { describe, it, expect } from 'vitest';
import {
  validateField,
  validateSurvey,
  RAW_DOLLARS_THRESHOLD_MILLIONS,
} from './validation';
import type { SurveyField, SurveyTemplate } from './templates';

function field(overrides: Partial<SurveyField> & Pick<SurveyField, 'type'>): SurveyField {
  return { key: 'f', label: 'F', ...overrides };
}

describe('validateField — currency (revenue in millions)', () => {
  const revenue = field({ type: 'currency', key: 'revenue' });

  it('accepts a normal figure with two decimals', () => {
    expect(validateField(revenue, '47.50')).toBeNull();
    expect(validateField(revenue, '250.00')).toBeNull();
  });

  it('accepts a legitimately large firm (the $10.9B respondent = 10,900)', () => {
    expect(validateField(revenue, '10900.00')).toBeNull();
  });

  it('does not cap large-but-real revenue below the raw-dollars threshold', () => {
    // $500B in millions — implausible for an entrant, but the guard is not a
    // cap, so it is the two-decimal rule (not a magnitude error) that governs.
    expect(validateField(revenue, '500000.00')).toBeNull();
  });

  it('flags raw dollars typed into a millions field', () => {
    const msg = 'Enter revenue in millions (e.g., 47.50, not 47,500,000)';
    expect(validateField(revenue, '47500000')).toBe(msg);
    // Commas and a dollar sign are stripped before the magnitude check.
    expect(validateField(revenue, '$47,500,000')).toBe(msg);
    expect(validateField(revenue, '47500000.00')).toBe(msg);
  });

  it('fires the raw-dollars guard exactly above the threshold', () => {
    const atCap = `${RAW_DOLLARS_THRESHOLD_MILLIONS}.00`;
    const overCap = `${RAW_DOLLARS_THRESHOLD_MILLIONS + 1}.00`;
    expect(validateField(revenue, atCap)).toBeNull();
    expect(validateField(revenue, overCap)).toBe(
      'Enter revenue in millions (e.g., 47.50, not 47,500,000)',
    );
  });

  it('rejects non-numeric input', () => {
    expect(validateField(revenue, 'abc')).toBe('Enter a valid dollar amount');
  });

  it('requires two decimal places', () => {
    const msg =
      'Enter a number that includes two decimal places (e.g., 47.50 OR 250.00)';
    expect(validateField(revenue, '47')).toBe(msg);
    expect(validateField(revenue, '47.5')).toBe(msg);
  });
});

describe('validateField — other types', () => {
  it('validates email', () => {
    const email = field({ type: 'email', key: 'e' });
    expect(validateField(email, 'a@b.co')).toBeNull();
    expect(validateField(email, 'nope')).toBe('Enter a valid email address');
  });

  it('validates percent bounds and whole numbers', () => {
    const pct = field({ type: 'percent', key: 'p' });
    expect(validateField(pct, '50')).toBeNull();
    expect(validateField(pct, '150')).toBe('Enter a value between 0 and 100');
    expect(validateField(pct, '33.3')).toBe('Enter a whole number (no decimals)');
  });

  it('validates plain numbers', () => {
    const num = field({ type: 'number', key: 'n' });
    expect(validateField(num, '12')).toBeNull();
    expect(validateField(num, 'x')).toBe('Enter a valid number');
  });
});

describe('validateField — required / empty', () => {
  it('flags a missing required field', () => {
    expect(validateField(field({ type: 'text', required: true }), '')).toBe(
      'This field is required',
    );
    expect(validateField(field({ type: 'text', required: true }), undefined)).toBe(
      'This field is required',
    );
  });

  it('skips validation for an empty optional field', () => {
    expect(validateField(field({ type: 'currency' }), '')).toBeNull();
    expect(validateField(field({ type: 'email' }), undefined)).toBeNull();
  });
});

describe('validateSurvey', () => {
  const template: SurveyTemplate = {
    id: 't',
    name: 'T',
    sections: [
      {
        title: 'Revenue',
        fields: [
          field({ type: 'currency', key: 'revenue_current' }),
          field({ type: 'currency', key: 'revenue_hidden', hideWhen: 'revenue_dnd' }),
        ],
      },
      {
        title: 'Markets',
        type: 'percentage_group',
        fields: [
          field({ type: 'percent', key: 'seg_a' }),
          field({ type: 'percent', key: 'seg_b' }),
        ],
      },
    ],
  };

  it('passes valid data', () => {
    expect(
      validateSurvey(template, { revenue_current: '10900.00', seg_a: '60', seg_b: '40' }),
    ).toEqual({});
  });

  it('skips hidden fields', () => {
    // revenue_hidden holds raw dollars but is hidden, so it must not error.
    const errors = validateSurvey(template, {
      revenue_current: '10900.00',
      revenue_hidden: '47500000',
      revenue_dnd: true,
      seg_a: '60',
      seg_b: '40',
    });
    expect(errors).toEqual({});
  });

  it('reuses the same currency rule as validateField (no drift)', () => {
    const errors = validateSurvey(template, { revenue_current: '47500000' });
    expect(errors.revenue_current).toBe(
      validateField(field({ type: 'currency', key: 'revenue_current' }), '47500000'),
    );
  });

  it('requires market segments to total 100%', () => {
    const errors = validateSurvey(template, {
      revenue_current: '10.00',
      seg_a: '60',
      seg_b: '30',
    });
    expect(errors._percentage_group).toContain('90%');
  });
});
