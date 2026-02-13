'use client';

import { useState, useMemo } from 'react';
import type { SurveyTemplate } from '@/lib/surveys/templates';
import { resolveLabel } from '@/lib/surveys/templates';
import { validateSurvey } from '@/lib/surveys/validation';
import SurveyField from './SurveyField';
import SurveyProgress from './SurveyProgress';

interface SurveyFormProps {
  template: SurveyTemplate;
  surveyYear: number;
  surveyName: string;
  deadline: string;
  token: string;
  /** Pre-populated firm name from the recipient record */
  initialFirmName?: string;
  /** Previously saved draft data to restore */
  initialDraftData?: Record<string, string | boolean> | null;
  /** ISO timestamp of last draft save */
  initialDraftSavedAt?: string | null;
  /** Called after successful submission */
  onSuccess?: () => void;
}

export default function SurveyForm({
  template,
  surveyYear,
  surveyName,
  deadline,
  token,
  initialFirmName,
  initialDraftData,
  initialDraftSavedAt,
  onSuccess,
}: SurveyFormProps) {
  const [currentSection, setCurrentSection] = useState(0);
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
            }
          }
          break;
      }
    }

    // Percentage group sum on last section validation / submit
    if (section.type === 'percentage_group' && percentageSum !== null && percentageSum > 0) {
      if (Math.abs(percentageSum - 100) > 0.5) {
        sectionErrors['_percentage_group'] = `Market segments total ${percentageSum}%. They should add up to 100%.`;
      }
    }

    setErrors(sectionErrors);
    return Object.keys(sectionErrors).length === 0;
  }

  function handleNext() {
    if (!validateCurrentSection()) return;
    setCurrentSection((prev) => Math.min(prev + 1, template.sections.length - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handlePrevious() {
    setErrors({});
    setCurrentSection((prev) => Math.max(prev - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSave() {
    setSaveStatus('saving');
    try {
      const response = await fetch('/api/surveys/responses/draft', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, data }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save draft');
      }

      const result = await response.json();
      setLastSavedAt(result.savedAt);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  }

  async function handleSubmit() {
    // Validate all sections
    const allErrors = validateSurvey(template, data);
    if (Object.keys(allErrors).length > 0) {
      // Find the first section with errors and navigate to it
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
      setErrors(allErrors);
      return;
    }

    // Validate current section too
    if (!validateCurrentSection()) return;

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

      setSubmitStatus('success');
      onSuccess?.();
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

  return (
    <div>
      <SurveyProgress sections={sectionNames} currentSection={currentSection} />

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
          Math.abs(percentageSum - 100) <= 0.5
            ? 'bg-green-50 text-green-700'
            : percentageSum > 100
              ? 'bg-red-50 text-red-700'
              : 'bg-amber-50 text-amber-700'
        }`}>
          Total: {percentageSum}%
          {Math.abs(percentageSum - 100) <= 0.5
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
            onClick={handleSave}
            disabled={saveStatus === 'saving' || submitStatus === 'submitting'}
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
              onClick={handleSubmit}
              disabled={submitStatus === 'submitting'}
              className="px-8 py-2.5 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitStatus === 'submitting' ? 'Submitting...' : 'Submit Survey'}
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
