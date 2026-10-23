/**
 * The two addresses the submission form asks for alongside the files: who
 * is submitting, and who the entry fee is invoiced to. Both are required.
 * Shared by the form and the upload route so they accept the same input.
 */

export interface ContactEmails {
  submitterEmail: string;
  invoiceEmail: string;
}

// Deliberately loose: something@something.tld, no spaces. Anything stricter
// turns away real addresses; the confirmation email is the real check.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length <= 254 && EMAIL_RE.test(value.trim());
}

/** Trimmed addresses, or the label of the first one that's missing or invalid. */
export function parseContactEmails(
  input: { submitterEmail?: unknown; invoiceEmail?: unknown }
): { ok: true; emails: ContactEmails } | { ok: false; error: string } {
  if (!isValidEmail(input.submitterEmail)) {
    return { ok: false, error: 'Please enter a valid email address for the person submitting.' };
  }
  if (!isValidEmail(input.invoiceEmail)) {
    return { ok: false, error: 'Please enter a valid email address for invoicing.' };
  }
  return {
    ok: true,
    emails: {
      submitterEmail: input.submitterEmail.trim(),
      invoiceEmail: input.invoiceEmail.trim(),
    },
  };
}
