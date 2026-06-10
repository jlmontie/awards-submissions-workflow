'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { surveyTemplates, resolveLabel } from '@/lib/surveys/templates';
import type { SurveyTemplate } from '@/lib/surveys/templates';

interface SurveyInfo {
  survey: { surveyId: string; name: string; year: number; templateId: string };
  recipient: {
    firmName: string;
    draftData: Record<string, string | boolean> | null;
    isCompleted: boolean;
  };
}

export default function SurveyConfirmationPage() {
  const params = useParams();
  const search = useSearchParams();
  const token = params.token as string;
  const wasEdit = search.get('edited') === '1';

  const [info, setInfo] = useState<SurveyInfo | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/surveys/token/${token}`);
        if (!res.ok) return;
        setInfo(await res.json());
      } catch {
        // Non-fatal: confirmation message still shows even if we can't
        // fetch the submission summary.
      }
    }
    load();
  }, [token]);

  const template: SurveyTemplate | undefined = info
    ? surveyTemplates[info.survey.templateId]
    : undefined;
  const submitted = info?.recipient?.isCompleted ? info.recipient.draftData : null;

  return (
    <main className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-6">
            <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-2xl font-heading font-bold text-navy-500">
            {wasEdit ? 'Submission Updated' : 'Thank You!'}
          </h1>
          <p className="mt-3 text-gray-600">
            {wasEdit
              ? 'Your changes have been saved.'
              : 'Your survey response has been submitted successfully. We appreciate your participation in the annual firm rankings.'}
          </p>
          <p className="mt-4 text-sm text-gray-500">
            Results will be published in the upcoming issue of{' '}
            <em>Utah Construction + Design</em>.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3">
            <Link
              href={`/surveys/${token}`}
              className="inline-flex items-center justify-center px-6 py-2.5 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 transition-colors"
            >
              Edit Your Submission
            </Link>
          </div>
        </div>

        {/* Submitted answers summary (mirrors the form's Review screen). */}
        {submitted && template && (
          <div className="mt-10">
            <h2 className="text-lg font-heading font-semibold text-navy-500 mb-3 text-center">
              Your Submitted Answers
            </h2>
            <div className="space-y-4">
              {template.sections.map((section, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-md border border-gray-200 shadow-sm overflow-hidden"
                >
                  <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-900">{section.title}</h3>
                  </div>
                  <dl className="divide-y divide-gray-100">
                    {section.fields.map((field) => {
                      if (field.hideWhen && submitted[field.hideWhen]) return null;
                      const raw = submitted[field.key];
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
                            {resolveLabel(field.label, info!.survey.year)}
                          </dt>
                          <dd className="col-span-2 text-gray-900 break-words">{display}</dd>
                        </div>
                      );
                    })}
                  </dl>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
