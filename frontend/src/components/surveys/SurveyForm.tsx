'use client';

import { useState, useMemo } from 'react';
import type { SurveyTemplate } from '@/lib/surveys/templates';
import { resolveLabel } from '@/lib/surveys/templates';
import { validateSurvey } from '@/lib/surveys/validation';
import SurveyField from './SurveyField';
import SurveyProgress from './SurveyProgress';

interface Collaborator {
  name: string;
  email: string;
}

interface SurveyFormProps {
  template: SurveyTemplate;
  surveyYear: number;
  surveyName: string;
  deadline: string;
  token: string;
  /** Pre-populated firm name from the recipient record */
  initialFirmName?: string;
  /** Previously saved draft / submitted data to restore */
  initialDraftData?: Record<string, string | boolean> | null;
  /** ISO timestamp of last save (draft or submission) */
  initialDraftSavedAt?: string | null;
  /** True when the recipient has already submitted — form acts as an editor. */
  isCompleted?: boolean;
  /** Other contacts at the same firm who received this same invitation. */
  collaborators?: Collaborator[];
  /** Called after successful submission */
  onSuccess?: (edited: boolean) => void;
}

export default function SurveyForm({
  template,
  surveyYear,
  surveyName: _surveyName,
  deadline: _deadline,
  token,
  initialFirmName,
  initialDraftData,
  initialDraftSavedAt,
  isCompleted = false,
  collaborators = [],
  onSuccess,
}: SurveyFormProps) {
  const [currentSection, setCurrentSection] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [data, setData] = useState<Record<string, string | boolean>>(() => {
    if (initialDraftData) {
      return { ...initialDraftData };
    }
    const initial: Record<string, string | boolean> = {};
    if (initialFirmName) {
      initial.firm_name = initialFirmName;
    }
    return initial;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [submitError, setSubmitError] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [autoSaveMessage, setAutoSaveMessage] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(initialDraftSavedAt ?? null);

  const section = template.sections[currentSection];
  const sectionNames = template.sections.map((s) => s.title);
  const isLastSection = currentSection === template.sections.length - 1;

  // Compute percentage sum for percentage_group sections
  const percentageSum = useMemo(() => {
    if (section.type !== 'percentage_group') return null;
    return section.fields.reduce((acc, field) => {
      const val = data[field.key];
      if (!val) return acc;
      const num = Number(String(val).replace(/%/g, ''));
      return acc + (isNaN(num) ? 0 : num);
    }, 0);
  }, [section, data]);

  function handleChange(key: string, value: string | boolean) {
    setData((prev) => ({ ...prev, [key]: value }));
    // Clear error on change
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  function validateCurrentSection(): boolean {
    const sectionErrors: Record<string, string> = {};

    for (const field of section.fields) {
      const value = data[field.key];

      // Skip hidden fields
      if (field.hideWhen && data[field.hideWhen]) continue;

      if (field.required && !value) {
        sectionErrors[field.key] = 'This field is required';
        continue;
      }

      if (!value) continue;
      const strValue = String(value).trim();
      if (field.required && strValue === '') {
        sectionErrors[field.key] = 'This field is required';
        continue;
      }

      switch (field.type) {
        case 'email':
          if (strValue && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strValue)) {
            sectionErrors[field.key] = 'Enter a valid email address';
          }
          break;
        case 'number':
          if (strValue && isNaN(Number(strValue))) {
            sectionErrors[field.key] = 'Enter a valid number';
          }
          break;
        case 'currency':
          if (strValue && isNaN(Number(strValue.replace(/[$,]/g, '')))) {
            sectionErrors[field.key] = 'Enter a valid dollar amount';
          }
          break;
        case 'percent':
          if (strValue) {
            const num = Number(strValue.replace(/%/g, ''));
            if (isNaN(num) || num < 0 || num > 100) {
              sectionErrors[field.key] = 'Enter a value between 0 and 100';
            } else if (!Number.isInteger(num)) {
              sectionErrors[field.key] = 'Enter a whole number (no decimals)';
            }
          }
          break;
      }
    }

    // Percentage group sum on last section validation / submit
    if (section.type === 'percentage_group' && percentageSum !== null && percentageSum > 0) {
      if (percentageSum !== 100) {
        sectionErrors['_percentage_group'] = `Market segments total ${percentageSum}%. They must add up to exactly 100%.`;
      }
    }

    setErrors(sectionErrors);
    return Object.keys(sectionErrors).length === 0;
  }

  /** Save draft silently; returns true on success. */
  async function saveDraft(): Promise<boolean> {
    try {
      const response = await fetch('/api/surveys/responses/draft', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, data }),
      });
      if (!response.ok) return false;
      const result = await response.json();
      setLastSavedAt(result.savedAt);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Save draft in the background without blocking navigation. Shows a toast
   * with the result. Skipped in edit mode (the draft endpoint rejects
   * completed recipients; edit-mode users save via the real Submit step).
   */
  function saveDraftInBackground(failureMessage = 'Could not save progress — continuing') {
    if (isCompleted) return;
    void (async () => {
      const ok = await saveDraft();
      setAutoSaveMessage(ok ? 'Progress saved' : failureMessage);
      setTimeout(() => setAutoSaveMessage(''), 2500);
    })();
  }

  function handleNext() {
    if (!validateCurrentSection()) return;

    // Advance the section synchronously so the new section becomes interactive
    // immediately. Persist the draft in the background.
    setCurrentSection((prev) => Math.min(prev + 1, template.sections.length - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    saveDraftInBackground();
  }

  function handleReview() {
    if (!validateCurrentSection()) return;

    // Final cross-section validation — if anything's off, jump to the first
    // bad section instead of showing the summary.
    const allErrors = validateSurvey(template, data);
    if (Object.keys(allErrors).length > 0) {
      for (let i = 0; i < template.sections.length; i++) {
        const sectionFields = template.sections[i].fields;
        const hasError = sectionFields.some((f) => allErrors[f.key]);
        if (hasError || (template.sections[i].type === 'percentage_group' && allErrors['_percentage_group'])) {
          setCurrentSection(i);
          setErrors(allErrors);
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
      }
    }

    setShowSummary(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    saveDraftInBackground('Could not save — review your answers below');
  }

  function handlePrevious() {
    setErrors({});
    setCurrentSection((prev) => Math.max(prev - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleEditSection(idx: number) {
    setShowSummary(false);
    setErrors({});
    setCurrentSection(idx);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleManualSave() {
    setSaveStatus('saving');
    const ok = await saveDraft();
    setSaveStatus(ok ? 'saved' : 'error');
    setTimeout(() => setSaveStatus('idle'), 3000);
  }

  async function handleSubmit() {
    // Run full validation one more time before submission
    const allErrors = validateSurvey(template, data);
    if (Object.keys(allErrors).length > 0) {
      for (let i = 0; i < template.sections.length; i++) {
        const sectionFields = template.sections[i].fields;
        const hasError = sectionFields.some((f) => allErrors[f.key]);
        if (hasError || (template.sections[i].type === 'percentage_group' && allErrors['_percentage_group'])) {
          setShowSummary(false);
          setCurrentSection(i);
          setErrors(allErrors);
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
      }
    }

    setSubmitStatus('submitting');
    setSubmitError('');

    try {
      const response = await fetch('/api/surveys/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, data }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to submit survey');
      }

      const result = await response.json().catch(() => ({}));
      setSubmitStatus('success');
      onSuccess?.(!!result.edited);
    } catch (err: any) {
      setSubmitStatus('error');
      setSubmitError(err.message || 'Something went wrong. Please try again.');
    }
  }

  if (submitStatus === 'success') {
    return null; // Parent page handles the redirect/confirmation
  }

  // Determine which fields to show (respect hideWhen)
  const visibleFields = section.fields.filter(
    (f) => !f.hideWhen || !data[f.hideWhen],
  );

  const submitButtonLabel = isCompleted ? 'Update Submission' : 'Submit Survey';
  const reviewButtonLabel = isCompleted ? 'Review Changes' : 'Review & Submit';

  // -------------------------------------------------------------------------
  // SUMMARY VIEW (rendered when showSummary === true)
  // -------------------------------------------------------------------------
  if (showSummary) {
    return (
      <div>
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900">Review Your Answers</h2>
          <p className="mt-1 text-sm text-gray-500">
            Please review your responses below. Click <strong>Edit</strong> on any section to make
            changes, or <strong>{submitButtonLabel}</strong> at the bottom when ready.
          </p>
        </div>

        <div className="space-y-6">
          {template.sections.map((sec, idx) => (
            <div
              key={idx}
              className="bg-white rounded-md border border-gray-200 shadow-sm overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900">{sec.title}</h3>
                <button
                  type="button"
                  onClick={() => handleEditSection(idx)}
                  className="text-sm font-medium text-amber-700 hover:text-amber-800"
                >
                  Edit
                </button>
              </div>
              <dl className="divide-y divide-gray-100">
                {sec.fields.map((field) => {
                  // Respect hideWhen
                  if (field.hideWhen && data[field.hideWhen]) return null;
                  const raw = data[field.key];
                  let display: string;
                  if (field.type === 'checkbox') {
                    display = raw ? 'Yes' : 'No';
                  } else if (raw === undefined || raw === '' || raw === false) {
                    display = '—';
                  } else if (field.type === 'currency') {
                    display = `$${raw}M`;
                  } else if (field.type === 'percent') {
                    display = `${raw}%`;
                  } else {
                    display = String(raw);
                  }
                  return (
                    <div key={field.key} className="grid grid-cols-3 gap-4 px-5 py-3 text-sm">
                      <dt className="col-span-1 font-medium text-gray-600">
                        {resolveLabel(field.label, surveyYear)}
                      </dt>
                      <dd className="col-span-2 text-gray-900 break-words">{display}</dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          ))}
        </div>

        {submitStatus === 'error' && (
          <div className="mt-4 p-4 bg-red-50 rounded-md">
            <p className="text-sm text-red-700">{submitError}</p>
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setShowSummary(false)}
            className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Back to Form
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitStatus === 'submitting'}
            className="px-8 py-2.5 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitStatus === 'submitting' ? 'Submitting...' : submitButtonLabel}
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // FORM VIEW (default)
  // -------------------------------------------------------------------------
  const showCollaboratorsBanner = currentSection === 0 && (collaborators.length > 0 || isCompleted);

  return (
    <div>
      <SurveyProgress sections={sectionNames} currentSection={currentSection} />

      {/* First-section banners: edit-mode notice + collaborators */}
      {showCollaboratorsBanner && (
        <div className="mb-6 space-y-3">
          {isCompleted && (
            <div className="rounded-md bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800">
              <p className="font-medium">You&rsquo;ve already submitted this survey.</p>
              <p className="mt-1">
                You can edit your answers below and click <strong>Update Submission</strong> to save changes.
              </p>
            </div>
          )}
          {collaborators.length > 0 && (
            <div className="rounded-md bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
              <p className="font-medium">
                {collaborators.length === 1
                  ? 'One person from your firm received this invitation:'
                  : `${collaborators.length} people from your firm received this invitation:`}
              </p>
              <ul className="mt-2 list-disc list-inside space-y-0.5">
                {collaborators.map((c, i) => (
                  <li key={i}>
                    {c.name}
                    {c.email ? (
                      <span className="text-amber-700"> &middot; {c.email}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-amber-800">
                Heads up: everyone above shares the same survey link. If multiple people fill it out
                at the same time, only the most recently saved version will be kept. Coordinate
                with your team to avoid overwriting each other&rsquo;s answers.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Section header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">{section.title}</h2>
        {section.description && (
          <p className="mt-1 text-sm text-gray-500">
            {resolveLabel(section.description, surveyYear)}
          </p>
        )}
      </div>

      {/* Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
        {visibleFields.map((field) => {
          const resolvedField = {
            ...field,
            label: resolveLabel(field.label, surveyYear),
          };
          return (
            <div
              key={field.key}
              className={field.half ? '' : 'sm:col-span-2'}
            >
              <SurveyField
                field={resolvedField}
                value={data[field.key] ?? ''}
                error={errors[field.key]}
                onChange={handleChange}
                disabled={submitStatus === 'submitting'}
              />
            </div>
          );
        })}
      </div>

      {/* Percentage group sum indicator */}
      {section.type === 'percentage_group' && percentageSum !== null && (
        <div className={`mt-4 p-3 rounded-md text-sm font-medium ${
          percentageSum === 100
            ? 'bg-green-50 text-green-700'
            : percentageSum > 100
              ? 'bg-red-50 text-red-700'
              : 'bg-amber-50 text-amber-700'
        }`}>
          Total: {percentageSum}%
          {percentageSum === 100
            ? ' -- Good!'
            : percentageSum > 0
              ? ` -- ${percentageSum > 100 ? 'Over' : 'Under'} by ${Math.abs(100 - percentageSum)}%`
              : ''}
        </div>
      )}

      {/* Section-level errors */}
      {errors['_percentage_group'] && (
        <p className="mt-2 text-sm text-red-600">{errors['_percentage_group']}</p>
      )}

      {/* Submit error */}
      {submitStatus === 'error' && (
        <div className="mt-4 p-4 bg-red-50 rounded-md">
          <p className="text-sm text-red-700">{submitError}</p>
        </div>
      )}

      {/* Inline auto-save toast */}
      {autoSaveMessage && (
        <div className="mt-4 px-3 py-2 rounded-md bg-green-50 border border-green-200 text-sm text-green-800 inline-flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {autoSaveMessage}
        </div>
      )}

      {/* Navigation buttons */}
      <div className="mt-8 grid grid-cols-3 items-start gap-4">
        <div>
          <button
            type="button"
            onClick={handlePrevious}
            disabled={currentSection === 0}
            className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
        </div>

        <div className="flex flex-col items-center">
          <button
            type="button"
            onClick={handleManualSave}
            disabled={saveStatus === 'saving' || submitStatus === 'submitting' || isCompleted}
            className={`px-6 py-2.5 text-sm font-medium rounded-md border disabled:opacity-50 disabled:cursor-not-allowed ${
              saveStatus === 'saved'
                ? 'text-green-700 bg-green-50 border-green-300'
                : saveStatus === 'error'
                  ? 'text-red-700 bg-red-50 border-red-300'
                  : 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50'
            }`}
          >
            {saveStatus === 'saving'
              ? 'Saving...'
              : saveStatus === 'saved'
                ? 'Saved!'
                : saveStatus === 'error'
                  ? 'Save failed'
                  : 'Save Progress'}
          </button>
          {lastSavedAt && (
            <p className="mt-1 text-xs text-gray-400">
              Last saved {new Date(lastSavedAt).toLocaleString()}
            </p>
          )}
        </div>

        <div className="flex justify-end">
          {isLastSection ? (
            <button
              type="button"
              onClick={handleReview}
              disabled={submitStatus === 'submitting'}
              className="px-8 py-2.5 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {reviewButtonLabel}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              className="px-8 py-2.5 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
