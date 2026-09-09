'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  validateTemplate,
  variantForStatus,
  type EmailTemplate,
  type EmailVariant,
} from '@/lib/surveys/invitation-email';

interface AudienceRecipient {
  recipientId: string;
  status: string;
  contacts: { contactEmail: string }[];
}

interface StoredTemplate {
  template: EmailTemplate;
  isCustom: boolean;
  updatedAt: string;
}

interface TemplateResponse {
  surveyName: string;
  deadline: string;
  hasDeadline: boolean;
  tokens: string[];
  variants: Record<EmailVariant, StoredTemplate>;
}

interface PreviewResponse {
  subject: string;
  html: string;
  text: string;
  sampleFirm: string | null;
  usedSampleData: boolean;
}

interface Props {
  surveyId: string;
  /** Every recipient on the survey; the audience split is derived from these. */
  recipients: AudienceRecipient[];
  /** Recipient ids the admin checked. Empty means "all firms". */
  selectedIds: string[];
  onClose: () => void;
  onSent: (message: string) => void;
}

const VARIANT_LABEL: Record<EmailVariant, string> = {
  first: 'First invitation',
  reminder: 'Reminder',
};

const SLOT_FIELDS: {
  key: keyof EmailTemplate;
  label: string;
  hint?: string;
  rows?: number;
}[] = [
  { key: 'subject', label: 'Subject' },
  { key: 'greeting', label: 'Greeting', rows: 2 },
  { key: 'intro', label: 'Opening paragraph', rows: 5 },
  {
    key: 'deadlineText',
    label: 'Deadline sentence',
    hint: 'Leave blank to omit this paragraph entirely.',
    rows: 3,
  },
  { key: 'closing', label: 'Closing line', rows: 2 },
];

function sameTemplate(a: EmailTemplate, b: EmailTemplate): boolean {
  return SLOT_FIELDS.every((f) => a[f.key] === b[f.key]);
}

export default function EmailComposer({
  surveyId,
  recipients,
  selectedIds,
  onClose,
  onSent,
}: Props) {
  const [data, setData] = useState<TemplateResponse | null>(null);
  const [loadError, setLoadError] = useState('');
  const [drafts, setDrafts] = useState<Record<EmailVariant, EmailTemplate> | null>(null);
  const [chosen, setChosen] = useState<Set<EmailVariant>>(new Set());
  const [activeTab, setActiveTab] = useState<EmailVariant>('first');

  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewMode, setPreviewMode] = useState<'html' | 'text'>('html');

  const [testEmail, setTestEmail] = useState('');
  const [testStatus, setTestStatus] = useState('');
  const [testSending, setTestSending] = useState(false);

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [resetting, setResetting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  // Which field last had focus, so a token chip inserts into the right place.
  const fieldRefs = useRef<Partial<Record<keyof EmailTemplate, HTMLTextAreaElement | HTMLInputElement | null>>>({});
  const lastFocused = useRef<keyof EmailTemplate>('intro');

  // --- Audience -------------------------------------------------------------

  const audience = useMemo(() => {
    const scope = new Set(selectedIds);
    const eligible = recipients.filter(
      (r) =>
        r.status !== 'completed' &&
        (scope.size === 0 || scope.has(r.recipientId)) &&
        // The send route skips firms with no mailable contact, so counting them
        // here would promise more mail than actually goes out.
        r.contacts.some((c) => c.contactEmail.trim()),
    );
    return {
      first: eligible.filter((r) => variantForStatus(r.status) === 'first').length,
      reminder: eligible.filter((r) => variantForStatus(r.status) === 'reminder').length,
    };
  }, [recipients, selectedIds]);

  // --- Load stored copy -----------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/surveys/admin/${surveyId}/email/template`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Failed to load email copy');
        if (cancelled) return;

        setData(body);
        setDrafts({
          first: { ...body.variants.first.template },
          reminder: { ...body.variants.reminder.template },
        });

        // Preselect whichever variants actually have an audience, and open the
        // tab for the one the admin is most likely here to edit.
        const initial = new Set<EmailVariant>();
        if (audience.first > 0) initial.add('first');
        if (audience.reminder > 0) initial.add('reminder');
        setChosen(initial);
        setActiveTab(audience.reminder > 0 ? 'reminder' : 'first');
      } catch (err: any) {
        if (!cancelled) setLoadError(err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
    // audience is derived from props that don't change while the modal is open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId]);

  // --- Preview --------------------------------------------------------------

  const refreshPreview = useCallback(
    async (variant: EmailVariant, template: EmailTemplate) => {
      setPreviewLoading(true);
      try {
        const res = await fetch(`/api/surveys/admin/${surveyId}/email/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ variant, template }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Preview failed');
        setPreview(body);
      } catch (err: any) {
        setPreview(null);
        setSendError(err.message);
      } finally {
        setPreviewLoading(false);
      }
    },
    [surveyId],
  );

  // Refresh on open and whenever the tab changes, but not on every keystroke —
  // each preview is a Sheets read.
  useEffect(() => {
    if (!drafts) return;
    refreshPreview(activeTab, drafts[activeTab]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, drafts !== null]);

  // --- Editing --------------------------------------------------------------

  function updateSlot(variant: EmailVariant, key: keyof EmailTemplate, value: string) {
    setSaveStatus('');
    setDrafts((prev) => (prev ? { ...prev, [variant]: { ...prev[variant], [key]: value } } : prev));
  }

  function insertToken(token: string) {
    if (!drafts) return;
    const key = lastFocused.current;
    const el = fieldRefs.current[key];
    const current = drafts[activeTab][key];
    const placeholder = `{{${token}}}`;

    if (!el) {
      updateSlot(activeTab, key, `${current}${placeholder}`);
      return;
    }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    updateSlot(activeTab, key, current.slice(0, start) + placeholder + current.slice(end));

    // Restore the caret after the inserted token once React has re-rendered.
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + placeholder.length;
      el.setSelectionRange(caret, caret);
    });
  }

  async function resetVariant(variant: EmailVariant) {
    setResetting(true);
    setSendError('');
    try {
      const res = await fetch(
        `/api/surveys/admin/${surveyId}/email/template?variant=${variant}`,
        { method: 'DELETE' },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Reset failed');

      const reload = await fetch(`/api/surveys/admin/${surveyId}/email/template`);
      const fresh = await reload.json();
      if (!reload.ok) throw new Error(fresh.error || 'Failed to reload email copy');

      setData(fresh);
      setDrafts({
        first: { ...fresh.variants.first.template },
        reminder: { ...fresh.variants.reminder.template },
      });
      refreshPreview(variant, fresh.variants[variant].template);
    } catch (err: any) {
      setSendError(err.message);
    } finally {
      setResetting(false);
    }
  }

  // --- Dirty tracking + validation -----------------------------------------

  const dirty = useMemo<Record<EmailVariant, boolean>>(() => {
    if (!data || !drafts) return { first: false, reminder: false };
    return {
      first: !sameTemplate(drafts.first, data.variants.first.template),
      reminder: !sameTemplate(drafts.reminder, data.variants.reminder.template),
    };
  }, [data, drafts]);

  const validationErrors = useMemo(() => {
    if (!drafts) return [];
    return [...chosen].flatMap((variant) =>
      validateTemplate(drafts[variant]).map((e) => `${VARIANT_LABEL[variant]}: ${e}`),
    );
  }, [drafts, chosen]);

  const totalTargets = [...chosen].reduce((sum, v) => sum + audience[v], 0);
  const canSend =
    !sending && chosen.size > 0 && totalTargets > 0 && validationErrors.length === 0;

  // Only the variants being sent, and only those actually edited, get written
  // back — so sending a reminder doesn't stamp the untouched invitation copy as
  // customized.
  function editedTemplates(): Partial<Record<EmailVariant, EmailTemplate>> {
    if (!drafts) return {};
    const out: Partial<Record<EmailVariant, EmailTemplate>> = {};
    for (const variant of chosen) {
      if (dirty[variant]) out[variant] = drafts[variant];
    }
    return out;
  }

  /**
   * Variants the admin has edited but isn't sending. Their edits would go
   * nowhere on Send, since only sent variants are persisted — so the footer
   * points at "Save copy" instead of dropping them silently.
   */
  const strandedEdits = (['first', 'reminder'] as EmailVariant[]).filter(
    (v) => dirty[v] && !chosen.has(v),
  );

  const anyDirty = dirty.first || dirty.reminder;

  // --- Actions --------------------------------------------------------------

  /** Persist edited copy without emailing anyone. */
  async function saveCopy() {
    if (!drafts) return;
    setSaving(true);
    setSendError('');
    setSaveStatus('');
    try {
      for (const variant of ['first', 'reminder'] as EmailVariant[]) {
        if (!dirty[variant]) continue;
        const res = await fetch(`/api/surveys/admin/${surveyId}/email/template`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ variant, template: drafts[variant] }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Save failed');
      }

      // Re-read so isCustom/updatedAt refresh and the dirty markers clear.
      const reload = await fetch(`/api/surveys/admin/${surveyId}/email/template`);
      const fresh = await reload.json();
      if (!reload.ok) throw new Error(fresh.error || 'Failed to reload email copy');
      setData(fresh);
      setDrafts({
        first: { ...fresh.variants.first.template },
        reminder: { ...fresh.variants.reminder.template },
      });
      setSaveStatus('Copy saved.');
    } catch (err: any) {
      setSendError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    if (!drafts || !testEmail.trim()) return;
    setTestSending(true);
    setTestStatus('');
    try {
      const res = await fetch(`/api/surveys/admin/${surveyId}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testTo: testEmail.trim(),
          variants: [activeTab],
          template: { [activeTab]: drafts[activeTab] },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Test send failed');
      setTestStatus(`Test ${VARIANT_LABEL[activeTab].toLowerCase()} sent to ${body.sentTo}.`);
    } catch (err: any) {
      setTestStatus(`Failed: ${err.message}`);
    } finally {
      setTestSending(false);
    }
  }

  async function send() {
    setSending(true);
    setSendError('');
    try {
      const res = await fetch(`/api/surveys/admin/${surveyId}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          all: selectedIds.length === 0,
          recipientIds: selectedIds.length > 0 ? selectedIds : undefined,
          variants: [...chosen],
          template: editedTemplates(),
          saveTemplate: true,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to send emails');

      const parts: string[] = [];
      if (body.sent > 0) parts.push(`sent to ${body.sent} firm${body.sent !== 1 ? 's' : ''}`);
      if (body.reminded > 0)
        parts.push(`reminded ${body.reminded} firm${body.reminded !== 1 ? 's' : ''}`);
      let msg = parts.length > 0 ? parts.join(', ') : 'No emails sent';
      msg = msg.charAt(0).toUpperCase() + msg.slice(1);
      if (body.skipped > 0) msg += `, ${body.skipped} skipped (no contacts)`;
      if (body.errors?.length > 0) msg += `. Errors: ${body.errors.join('; ')}`;
      onSent(msg);
    } catch (err: any) {
      setSendError(err.message);
      setSending(false);
    }
  }

  // --- Chrome ---------------------------------------------------------------

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !sending) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, sending]);

  const deadlineWarning =
    data && !data.hasDeadline && drafts
      ? /\{\{\s*deadline\s*\}\}/.test(drafts[activeTab].subject + drafts[activeTab].deadlineText)
      : false;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="relative my-8 w-full max-w-6xl rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="font-heading text-lg font-semibold text-navy-500">
              Compose &amp; Send
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {selectedIds.length > 0
                ? `${selectedIds.length} firm${selectedIds.length !== 1 ? 's' : ''} selected`
                : 'All firms'}
              {data ? ` · ${data.surveyName}` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={sending}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loadError && (
          <div className="m-6 rounded-md bg-red-50 p-4 text-sm text-red-800">{loadError}</div>
        )}

        {!data || !drafts ? (
          !loadError && <div className="px-6 py-12 text-center text-gray-500">Loading…</div>
        ) : (
          <>
            {/* Step 1 — audience */}
            <div className="border-b border-gray-200 px-6 py-4">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
                1 · Who this goes to
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                {(['first', 'reminder'] as EmailVariant[]).map((variant) => {
                  const count = audience[variant];
                  return (
                    <label
                      key={variant}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                        count === 0
                          ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400'
                          : chosen.has(variant)
                            ? 'border-navy-500 bg-navy-50 text-navy-500'
                            : 'border-gray-300 text-gray-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={count === 0}
                        checked={chosen.has(variant)}
                        onChange={() => {
                          setChosen((prev) => {
                            const next = new Set(prev);
                            if (next.has(variant)) next.delete(variant);
                            else next.add(variant);
                            return next;
                          });
                          setActiveTab(variant);
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                      />
                      <span className="font-medium">{VARIANT_LABEL[variant]}</span>
                      <span className="text-gray-500">
                        {count} firm{count !== 1 ? 's' : ''}
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Firms that have already been emailed receive the reminder; everyone else receives
                the first invitation. Completed firms are never emailed.
              </p>
            </div>

            {/* Step 2 + 3 — edit and preview */}
            <div className="grid gap-6 px-6 py-4 lg:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
                  2 · Message
                </p>

                {/* Variant tabs */}
                <div className="mt-3 flex gap-1 border-b border-gray-200">
                  {(['first', 'reminder'] as EmailVariant[]).map((variant) => (
                    <button
                      key={variant}
                      onClick={() => setActiveTab(variant)}
                      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                        activeTab === variant
                          ? 'border-primary-500 text-navy-500'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {VARIANT_LABEL[variant]}
                      {dirty[variant] && <span className="ml-1 text-primary-500">•</span>}
                      {!chosen.has(variant) && (
                        <span className="ml-1 text-xs text-gray-400">(not sending)</span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {data.variants[activeTab].isCustom
                      ? `Custom copy${
                          data.variants[activeTab].updatedAt
                            ? ` · saved ${new Date(data.variants[activeTab].updatedAt).toLocaleDateString()}`
                            : ''
                        }`
                      : 'Using the default copy'}
                  </span>
                  {data.variants[activeTab].isCustom && (
                    <button
                      onClick={() => resetVariant(activeTab)}
                      disabled={resetting}
                      className="text-gray-500 underline hover:text-gray-700 disabled:opacity-50"
                    >
                      Reset to default
                    </button>
                  )}
                </div>

                {/* Token chips */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-gray-500">Insert:</span>
                  {data.tokens.map((token) => (
                    <button
                      key={token}
                      onClick={() => insertToken(token)}
                      className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700 hover:bg-gray-200"
                    >
                      {`{{${token}}}`}
                    </button>
                  ))}
                </div>

                {deadlineWarning && (
                  <div className="mt-3 rounded-md bg-amber-50 p-3 text-xs text-amber-800">
                    This survey has no deadline set, so lines using{' '}
                    <code className="font-mono">{'{{deadline}}'}</code> will fall back to generic
                    wording (&ldquo;at your earliest convenience&rdquo;).
                  </div>
                )}

                {/* Slot fields */}
                <div className="mt-4 space-y-3">
                  {SLOT_FIELDS.map((field) => {
                    const value = drafts[activeTab][field.key];
                    const common = {
                      value,
                      onFocus: () => {
                        lastFocused.current = field.key;
                      },
                      onChange: (
                        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
                      ) => updateSlot(activeTab, field.key, e.target.value),
                      className:
                        'mt-1 block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-primary-500 focus:ring-primary-500',
                    };
                    return (
                      <div key={field.key}>
                        <label className="block text-xs font-medium text-gray-700">
                          {field.label}
                        </label>
                        {field.key === 'subject' ? (
                          <input
                            type="text"
                            ref={(el) => {
                              fieldRefs.current[field.key] = el;
                            }}
                            {...common}
                          />
                        ) : (
                          <textarea
                            rows={field.rows}
                            ref={(el) => {
                              fieldRefs.current[field.key] = el;
                            }}
                            {...common}
                          />
                        )}
                        {field.hint && (
                          <p className="mt-0.5 text-xs text-gray-400">{field.hint}</p>
                        )}
                      </div>
                    );
                  })}
                </div>

                <p className="mt-3 text-xs text-gray-400">
                  Wrap text in <code className="font-mono">**asterisks**</code> for bold. A blank
                  line starts a new paragraph. Edits are saved as this survey&rsquo;s copy when you
                  send.
                </p>
              </div>

              {/* Preview */}
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
                    3 · Preview
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex rounded-md border border-gray-300 text-xs">
                      {(['html', 'text'] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setPreviewMode(mode)}
                          className={`px-2 py-1 ${
                            previewMode === mode
                              ? 'bg-gray-100 font-medium text-navy-500'
                              : 'text-gray-500'
                          }`}
                        >
                          {mode === 'html' ? 'HTML' : 'Plain text'}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => refreshPreview(activeTab, drafts[activeTab])}
                      disabled={previewLoading}
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {previewLoading ? 'Updating…' : 'Update preview'}
                    </button>
                  </div>
                </div>

                {preview && (
                  <p className="mt-2 text-xs text-gray-500">
                    <span className="font-medium">Subject:</span> {preview.subject}
                    <br />
                    {preview.usedSampleData
                      ? 'Showing placeholder values — no recipient matched this variant.'
                      : `Previewed against ${preview.sampleFirm}.`}
                  </p>
                )}

                <div className="mt-2 overflow-hidden rounded-md border border-gray-200 bg-gray-50">
                  {previewMode === 'html' ? (
                    <iframe
                      title="Email preview"
                      sandbox=""
                      srcDoc={preview?.html || ''}
                      className="h-[560px] w-full border-0 bg-white"
                    />
                  ) : (
                    <pre className="h-[560px] overflow-auto whitespace-pre-wrap bg-white p-4 font-mono text-xs text-gray-700">
                      {preview?.text || ''}
                    </pre>
                  )}
                </div>

                {/* Test send */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    type="email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="min-w-0 flex-1 rounded-md border-gray-300 text-sm shadow-sm focus:border-primary-500 focus:ring-primary-500"
                  />
                  <button
                    onClick={sendTest}
                    disabled={testSending || !testEmail.trim()}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {testSending ? 'Sending…' : `Send test ${VARIANT_LABEL[activeTab].toLowerCase()}`}
                  </button>
                </div>
                {testStatus && (
                  <p className="mt-1.5 text-xs text-gray-600">
                    {testStatus} No firm records were changed.
                  </p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 px-6 py-4">
              {validationErrors.length > 0 && (
                <ul className="mb-3 list-inside list-disc rounded-md bg-red-50 p-3 text-xs text-red-800">
                  {validationErrors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
              {sendError && (
                <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-800">{sendError}</div>
              )}
              {strandedEdits.length > 0 && (
                <div className="mb-3 rounded-md bg-amber-50 p-3 text-xs text-amber-800">
                  You&rsquo;ve edited the{' '}
                  {strandedEdits.map((v) => VARIANT_LABEL[v].toLowerCase()).join(' and ')} copy but
                  {strandedEdits.length > 1 ? ' those are' : " it isn't"} in this send. Use
                  &ldquo;Save copy&rdquo; to keep{' '}
                  {strandedEdits.length > 1 ? 'those edits' : 'that edit'} for next time &mdash;
                  sending only saves the copy it actually uses.
                </div>
              )}
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-gray-600">
                  {chosen.size === 0
                    ? 'Choose at least one audience above.'
                    : `Sending to ${totalTargets} firm${totalTargets !== 1 ? 's' : ''}: ` +
                      [...chosen]
                        .map((v) => `${audience[v]} ${VARIANT_LABEL[v].toLowerCase()}`)
                        .join(', ')}
                  {saveStatus && <span className="ml-2 text-green-700">{saveStatus}</span>}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={onClose}
                    disabled={sending}
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveCopy}
                    disabled={saving || sending || !anyDirty}
                    title="Save the edited copy without emailing anyone"
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save copy'}
                  </button>
                  <button
                    onClick={send}
                    disabled={!canSend}
                    className="rounded-md border border-transparent bg-navy-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-navy-600 disabled:opacity-50"
                  >
                    {sending ? 'Sending…' : `Send to ${totalTargets} firm${totalTargets !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
