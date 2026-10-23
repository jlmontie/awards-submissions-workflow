import { describe, expect, it } from 'vitest';
import { isValidEmail, parseContactEmails } from './contact-emails';

describe('isValidEmail', () => {
  it('accepts ordinary addresses, trimmed', () => {
    expect(isValidEmail('james@aeurbia.com')).toBe(true);
    expect(isValidEmail('  billing+ucd@firm.co.uk ')).toBe(true);
  });

  it('rejects missing or malformed addresses', () => {
    for (const bad of [undefined, '', 'james', 'james@aeurbia', 'james @aeurbia.com', 42]) {
      expect(isValidEmail(bad)).toBe(false);
    }
  });
});

describe('parseContactEmails', () => {
  it('returns both addresses trimmed', () => {
    expect(parseContactEmails({ submitterEmail: ' a@b.co ', invoiceEmail: 'ap@b.co' })).toEqual({
      ok: true,
      emails: { submitterEmail: 'a@b.co', invoiceEmail: 'ap@b.co' },
    });
  });

  it('names the field that is wrong', () => {
    expect(parseContactEmails({ submitterEmail: 'a@b.co' })).toEqual({
      ok: false,
      error: 'Please enter a valid email address for invoicing.',
    });
    expect(parseContactEmails({ invoiceEmail: 'ap@b.co' })).toMatchObject({ ok: false });
  });
});
