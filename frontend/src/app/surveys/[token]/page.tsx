'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import SurveyForm from '@/components/surveys/SurveyForm';
import { surveyTemplates } from '@/lib/surveys/templates';
import type { SurveyTemplate } from '@/lib/surveys/templates';

interface SurveyInfo {
  survey: {
    surveyId: string;
    name: string;
    year: number;
    deadline: string;
    templateId: string;
  };
  recipient: {
    firmName: string;
    draftData: Record<string, string | boolean> | null;
    draftSavedAt: string | null;
  };
}

export default function SurveyPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [surveyInfo, setSurveyInfo] = useState<SurveyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadSurvey() {
      try {
        const res = await fetch(`/api/surveys/token/${token}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (res.status === 410) {
            setError('This survey has been closed. Thank you for your interest.');
          } else if (res.status === 409) {
            setError('You have already submitted a response to this survey. Thank you!');
          } else {
            setError(data.error || 'Survey not found. Please check your link.');
          }
          return;
        }
        const data = await res.json();
        setSurveyInfo(data);
      } catch (err) {
        setError('Unable to load survey. Please try again later.');
      } finally {
        setLoading(false);
      }
    }
    loadSurvey();
  }, [token]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-amber-500 border-r-transparent" />
          <p className="mt-4 text-sm text-gray-500">Loading survey...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center px-6">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h1 className="mt-4 text-lg font-semibold text-gray-900">Survey Unavailable</h1>
          <p className="mt-2 text-sm text-gray-500">{error}</p>
        </div>
      </main>
    );
  }

  if (!surveyInfo) return null;

  const template: SurveyTemplate | undefined = surveyTemplates[surveyInfo.survey.templateId];
  if (!template) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Unknown survey type.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <div className="flex items-center justify-center mb-4">
            <img
              src="/ucd-logo.png"
              alt="Utah Construction & Design"
              className="h-12 w-auto"
            />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 text-center">
            {surveyInfo.survey.name}
          </h1>
          <p className="mt-1 text-sm text-gray-500 text-center">
            Due: {surveyInfo.survey.deadline}
          </p>
          {surveyInfo.recipient.firmName && (
            <p className="mt-2 text-sm text-gray-600 text-center">
              Survey for {surveyInfo.recipient.firmName}
            </p>
          )}
        </div>
      </header>

      {/* Form */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        <SurveyForm
          template={template}
          surveyYear={surveyInfo.survey.year}
          surveyName={surveyInfo.survey.name}
          deadline={surveyInfo.survey.deadline}
          token={token}
          initialFirmName={surveyInfo.recipient.firmName}
          initialDraftData={surveyInfo.recipient.draftData}
          initialDraftSavedAt={surveyInfo.recipient.draftSavedAt}
          onSuccess={() => router.push(`/surveys/${token}/confirmation`)}
        />
      </div>
    </main>
  );
}
