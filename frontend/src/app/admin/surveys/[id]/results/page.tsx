'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface ExportSection {
  key: string;
  label: string;
  filename: string;
  text: string;
  count: number;
}

interface ExportPayload {
  templateId: string;
  sections: ExportSection[];
}

export default function ResultsPage() {
  const params = useParams();
  const surveyId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState<ExportPayload | null>(null);
  const [activeKey, setActiveKey] = useState<string>('');
  const [surveyName, setSurveyName] = useState('');

  useEffect(() => {
    loadResults();
  }, [surveyId]);

  async function loadResults() {
    setLoading(true);
    setError('');
    try {
      const detailRes = await fetch(`/api/surveys/admin/${surveyId}`);
      if (detailRes.ok) {
        const detail = await detailRes.json();
        setSurveyName(detail.survey.name);
      }

      const res = await fetch(
        `/api/surveys/admin/${surveyId}/export?format=json`,
      );
      if (!res.ok) {
        if (res.status === 404) {
          setError('No responses yet for this survey.');
          return;
        }
        throw new Error('Failed to load results');
      }

      const data: ExportPayload = await res.json();
      setPayload(data);
      if (data.sections.length) {
        setActiveKey(data.sections[0].key);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadSection(section: ExportSection) {
    try {
      const res = await fetch(
        `/api/surveys/admin/${surveyId}/export?section=${encodeURIComponent(section.key)}`,
      );
      if (!res.ok) throw new Error('Failed to download');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = section.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleDownloadZip() {
    try {
      const res = await fetch(`/api/surveys/admin/${surveyId}/export?format=zip`);
      if (!res.ok) throw new Error('Failed to download');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ||
        `${surveyId}_export.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (loading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="text-center py-12">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
          <p className="mt-2 text-sm text-gray-500">Loading results...</p>
        </div>
      </div>
    );
  }

  const activeSection = payload?.sections.find((s) => s.key === activeKey);

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-heading font-semibold text-navy-500">
            Results: {surveyName || surveyId}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Ranked firms ready for publication export
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex gap-2">
          <Link
            href={`/admin/surveys/${surveyId}`}
            className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Back to Survey
          </Link>
          {payload && payload.sections.length > 1 && (
            <button
              onClick={handleDownloadZip}
              className="inline-flex items-center justify-center rounded-md border border-transparent bg-primary-500 px-4 py-2 text-sm font-medium text-black shadow-sm hover:bg-black hover:text-white transition-colors"
            >
              Download All (.zip)
            </button>
          )}
        </div>
      </div>

      {error ? (
        <div className="mt-8 text-center py-12 bg-white shadow rounded-lg">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <p className="mt-4 text-gray-500">{error}</p>
        </div>
      ) : payload ? (
        <div className="mt-8">
          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex flex-wrap gap-x-6" aria-label="Sections">
              {payload.sections.map((section) => {
                const isActive = section.key === activeKey;
                return (
                  <button
                    key={section.key}
                    onClick={() => setActiveKey(section.key)}
                    className={`whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium ${
                      isActive
                        ? 'border-primary-500 text-navy-500'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                    }`}
                  >
                    {section.label}
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
                        isActive
                          ? 'bg-primary-100 text-primary-800'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {section.count}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Active section */}
          {activeSection && (
            <div className="mt-6 bg-white shadow rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-heading font-medium text-navy-500">
                    {activeSection.label}
                  </h2>
                  <p className="mt-1 text-xs text-gray-500">
                    {activeSection.count} firm
                    {activeSection.count === 1 ? '' : 's'} ·{' '}
                    {activeSection.filename}
                  </p>
                </div>
                <button
                  onClick={() => handleDownloadSection(activeSection)}
                  className="inline-flex items-center justify-center rounded-md border border-transparent bg-primary-500 px-4 py-2 text-sm font-medium text-black shadow-sm hover:bg-black hover:text-white transition-colors"
                >
                  Download (.rtf)
                </button>
              </div>
              <div className="overflow-x-auto bg-gray-50">
                <pre className="p-6 text-xs font-mono text-gray-900 whitespace-pre min-w-min">
                  {activeSection.text}
                </pre>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
