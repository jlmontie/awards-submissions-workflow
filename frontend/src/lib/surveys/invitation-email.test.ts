import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEMPLATES,
  applyDeadlineFallback,
  renderInvitationEmail,
  unknownTokens,
  validateTemplate,
  variantForStatus,
  type EmailTemplate,
  type TemplateVars,
} from './invitation-email';

const VARS: TemplateVars = {
  contact_name: 'Dana Reed',
  firm_name: 'Acme Engineering',
  survey_name: 'Top Utah Engineers Survey',
  deadline: 'October 15, 2026',
  survey_url: 'https://example.test/surveys/abc123',
};

function render(template: EmailTemplate, overrides: Partial<TemplateVars> = {}) {
  return renderInvitationEmail({
    template,
    variant: 'reminder',
    vars: { ...VARS, ...overrides },
    appUrl: 'https://example.test',
  });
}

describe('variantForStatus', () => {
  it('treats already-mailed recipients as reminders', () => {
    expect(variantForStatus('sent')).toBe('reminder');
    expect(variantForStatus('reminded')).toBe('reminder');
  });

  it('treats everyone else as a first invitation', () => {
    expect(variantForStatus('pending')).toBe('first');
    expect(variantForStatus('')).toBe('first');
    expect(variantForStatus('in_progress')).toBe('first');
  });
});

describe('token substitution', () => {
  it('substitutes into subject, greeting and body', () => {
    const out = render(DEFAULT_TEMPLATES.reminder);
    expect(out.subject).toBe(
      'Reminder: Top Utah Engineers Survey — Survey Closes October 15, 2026',
    );
    expect(out.html).toContain('Hi Dana Reed,');
    expect(out.text).toContain('Hi Dana Reed,');
    expect(out.html).toContain('<strong>Acme Engineering</strong>');
    expect(out.text).toContain('Acme Engineering');
  });

  it('leaves no placeholder unreplaced in the default copy', () => {
    for (const variant of ['first', 'reminder'] as const) {
      const out = renderInvitationEmail({
        template: DEFAULT_TEMPLATES[variant],
        variant,
        vars: VARS,
        appUrl: 'https://example.test',
      });
      expect(out.subject).not.toMatch(/\{\{/);
      expect(out.html).not.toMatch(/\{\{/);
      expect(out.text).not.toMatch(/\{\{/);
    }
  });

  it('renders the survey link in both parts', () => {
    const out = render(DEFAULT_TEMPLATES.reminder);
    expect(out.html).toContain('https://example.test/surveys/abc123');
    expect(out.text).toContain('https://example.test/surveys/abc123');
  });
});

describe('markup subset', () => {
  const template: EmailTemplate = {
    ...DEFAULT_TEMPLATES.reminder,
    intro: 'One **bold** word.\n\nA second paragraph.',
  };

  it('converts **bold** to <strong> in HTML and strips it in text', () => {
    const out = render(template);
    expect(out.html).toContain('One <strong>bold</strong> word.');
    expect(out.text).toContain('One bold word.');
    expect(out.text).not.toContain('**');
  });

  it('splits blank-line-separated paragraphs into separate <p> tags', () => {
    const out = render(template);
    expect(out.html).toContain('<p style="margin:0 0 16px 0;">One <strong>bold</strong> word.</p>');
    expect(out.html).toContain('<p style="margin:0 0 16px 0;">A second paragraph.</p>');
  });

  it('omits the deadline paragraph when that slot is blank', () => {
    const out = render({ ...DEFAULT_TEMPLATES.reminder, deadlineText: '' });
    expect(out.html).not.toContain('survey closes on');
    expect(out.text).not.toContain('survey closes on');
  });
});

describe('escaping', () => {
  it('escapes HTML in admin-authored copy', () => {
    const out = render({
      ...DEFAULT_TEMPLATES.reminder,
      closing: 'Thanks <script>alert(1)</script>',
    });
    expect(out.html).not.toContain('<script>');
    expect(out.html).toContain('&lt;script&gt;');
  });

  it('escapes HTML in sheet-sourced values', () => {
    const out = render(DEFAULT_TEMPLATES.reminder, {
      firm_name: '<img src=x onerror=alert(1)>',
    });
    expect(out.html).not.toContain('<img src=x');
    expect(out.html).toContain('&lt;img src=x');
  });

  it('does not let a token value open markup', () => {
    const out = render(DEFAULT_TEMPLATES.reminder, { firm_name: '**not bold**' });
    // The value's asterisks are substituted after bold conversion, so they stay
    // literal rather than producing a nested <strong>.
    expect(out.html).toContain('**not bold**');
  });
});

describe('missing deadline', () => {
  it('falls back on slots that reference {{deadline}}', () => {
    const out = render(DEFAULT_TEMPLATES.reminder, { deadline: '' });
    expect(out.subject).toBe('Reminder: Top Utah Engineers Survey — Please Complete Your Survey');
    expect(out.text).toContain('Please complete the survey at your earliest convenience.');
  });

  it('leaves custom copy alone when it never mentions the deadline', () => {
    const custom: EmailTemplate = {
      ...DEFAULT_TEMPLATES.reminder,
      subject: 'A quick nudge about {{survey_name}}',
      deadlineText: 'Whenever you get a minute.',
    };
    const out = render(custom, { deadline: '' });
    expect(out.subject).toBe('A quick nudge about Top Utah Engineers Survey');
    expect(out.text).toContain('Whenever you get a minute.');
  });

  it('is a no-op when a deadline is set', () => {
    const template = DEFAULT_TEMPLATES.reminder;
    expect(applyDeadlineFallback(template, 'reminder', 'Oct 15')).toEqual(template);
  });
});

describe('validation', () => {
  it('accepts the shipped defaults', () => {
    expect(validateTemplate(DEFAULT_TEMPLATES.first)).toEqual([]);
    expect(validateTemplate(DEFAULT_TEMPLATES.reminder)).toEqual([]);
  });

  it('rejects unknown placeholders', () => {
    const errors = validateTemplate({
      ...DEFAULT_TEMPLATES.reminder,
      intro: 'Hello {{firstname}}',
    });
    expect(errors.join(' ')).toContain('{{firstname}}');
  });

  it('rejects empty required slots but allows an empty deadline slot', () => {
    expect(validateTemplate({ ...DEFAULT_TEMPLATES.first, closing: '  ' })).toHaveLength(1);
    expect(validateTemplate({ ...DEFAULT_TEMPLATES.first, deadlineText: '' })).toEqual([]);
  });

  it('rejects an over-long subject', () => {
    const errors = validateTemplate({
      ...DEFAULT_TEMPLATES.first,
      subject: 'x'.repeat(201),
    });
    expect(errors.join(' ')).toContain('subject is too long');
  });

  it('reports every unknown token once', () => {
    expect(unknownTokens('{{nope}} and {{nope}} and {{firm_name}}')).toEqual(['nope']);
  });
});

describe('shell', () => {
  it('keeps the CTA, signature and footer regardless of custom copy', () => {
    const out = render({
      subject: 'Sub',
      greeting: 'Hey,',
      intro: 'Body.',
      deadlineText: '',
      closing: 'Bye.',
    });
    expect(out.html).toContain('Complete Your Survey');
    expect(out.html).toContain('Ladd Marshall');
    expect(out.html).toContain('Utah Construction + Design');
    expect(out.html).toContain('ucd-bg-navy');
  });
});
