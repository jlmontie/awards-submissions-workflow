'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { surveyTemplates, resolveLabel } from '@/lib/surveys/templates';
import type { SurveyTemplate } from '@/lib/surveys/templates';

interface ViewData {
  survey: {
    surveyId: string;
    name: string;
    year: number;
    templateId: string;
  };
  recipient: {
    recipientId: string;
    firmName: string;
    status: string;
    completedAt: string;
  };
  response: Record<string, string> | null;
}

export default function AdminViewSubmissionPage() {
  const params = useParams();
  const surveyId = params.id as string;
  const recipientId = params.recipientId as string;

  const [data, setData] = useState<ViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/surveys/admin/${surveyId}/recipient/${recipientId}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Failed to load submission');
        }
        setData(await res.json());
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [surveyId, recipientId]);

  if (loading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="text-center py-12">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent" />
          <p className="mt-2 text-sm text-gray-500">Loading submission...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="text-center py-12">
          <p className="text-gray-500">{error || 'Submission not found'}</p>
          <Link
            href={`/admin/surveys/${surveyId}`}
            className="mt-2 inline-flex text-sm text-charcoal-500 hover:text-secondary-400"
          >
            Back to survey
          </Link>
        </div>
      </div>
    );
  }

  const template: SurveyTemplate | undefined = surveyTemplates[data.survey.templateId];

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-heading font-semibold text-navy-500">
            {data.recipient.firmName || 'Unnamed firm'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {data.survey.name}
            {data.recipient.completedAt && (
              <> &middot; Submitted {new Date(data.recipient.completedAt).toLocaleString()}</>
            )}
          </p>
        </div>
        <Link
          href={`/admin/surveys/${surveyId}`}
          className="mt-4 sm:mt-0 inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          Back to survey
        </Link>
      </div>

      {!data.response && (
        <div className="mt-6 rounded-md bg-yellow-50 p-4 text-sm text-yellow-800">
          No submitted response was found for this firm yet.
        </div>
      )}

      {data.response && template && (
        <div className="mt-6 space-y-6">
          {template.sections.map((section, idx) => (
            <div
              key={idx}
              className="bg-white rounded-md border border-gray-200 shadow-sm overflow-hidden"
            >
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                <h2 className="text-sm font-semibold text-gray-900">{section.title}</h2>
              </div>
              <dl className="divide-y divide-gray-100">
                {section.fields.map((field) => {
                  const raw = data.response![field.key];
                  let display: string;
                  if (field.type === 'checkbox') {
                    display = String(raw || '').toUpperCase() === 'TRUE' ? 'Yes' : 'No';
                  } else if (raw === undefined || raw === '' || raw === null) {
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
                        {resolveLabel(field.label, data.survey.year)}
                      </dt>
                      <dd className="col-span-2 text-gray-900 break-words">{display}</dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          ))}
        </div>
      )}

      {data.response && !template && (
        <div className="mt-6 bg-white rounded-md border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-900">Submitted answers</h2>
          </div>
          <dl className="divide-y divide-gray-100">
            {Object.entries(data.response).map(([k, v]) => (
              <div key={k} className="grid grid-cols-3 gap-4 px-5 py-3 text-sm">
                <dt className="col-span-1 font-medium text-gray-600">{k}</dt>
                <dd className="col-span-2 text-gray-900 break-words">{v || '—'}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
