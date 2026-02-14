'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Survey {
  surveyId: string;
  name: string;
  category: string;
  year: string;
  deadline: string;
  status: string;
  templateId: string;
  recipientCount: number;
  responseCount: number;
}

export default function SurveysAdminPage() {
  const router = useRouter();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadSurveys();
  }, []);

  async function loadSurveys() {
    setLoading(true);
    try {
      const res = await fetch('/api/surveys/admin/list');
      const data = await res.json();
      if (Array.isArray(data)) {
        setSurveys(data);
      }
    } catch (error) {
      console.error('Error loading surveys:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredSurveys = surveys.filter((s) => {
    if (filter === 'all') return true;
    return s.status === filter;
  });

  function getStatusBadge(status: string) {
    const styles: Record<string, string> = {
      draft: 'bg-yellow-100 text-yellow-800',
      active: 'bg-green-100 text-green-800',
      closed: 'bg-gray-100 text-gray-800',
    };
    return (
      <span
        className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
          styles[status] || styles.draft
        }`}
      >
        {status}
      </span>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-heading font-semibold text-navy-500">Surveys</h1>
          <p className="mt-2 text-sm text-gray-700">
            Manage firm rankings surveys for Architects, GC&apos;s, and Engineers
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
          <Link
            href="/admin/surveys/new"
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-primary-500 px-4 py-2 text-sm font-medium text-black shadow-sm hover:bg-black hover:text-white transition-colors"
          >
            New Survey
          </Link>
        </div>
      </div>

      {/* Status Filters */}
      <div className="mt-4 flex rounded-md shadow-sm">
        {(['all', 'draft', 'active', 'closed'] as const).map((f, i, arr) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`relative inline-flex items-center px-3 py-2 text-sm font-semibold ring-1 ring-inset ring-gray-300 ${
              i === 0 ? 'rounded-l-md' : '-ml-px'
            } ${i === arr.length - 1 ? 'rounded-r-md' : ''} ${
              filter === f
                ? 'bg-navy-500 text-white'
                : 'bg-white text-gray-900 hover:bg-gray-50'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Surveys Table */}
      <div className="mt-8 bg-white shadow rounded-lg overflow-hidden">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
            <p className="mt-2 text-sm text-gray-500">Loading surveys...</p>
          </div>
        ) : filteredSurveys.length === 0 ? (
          <div className="text-center py-12">
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
            <p className="mt-4 text-gray-500">No surveys found</p>
            <Link
              href="/admin/surveys/new"
              className="mt-2 inline-flex text-sm text-charcoal-500 hover:text-secondary-400"
            >
              Create your first survey
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Year
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Deadline
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Responses
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredSurveys.map((survey) => (
                  <tr
                    key={survey.surveyId}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() =>
                      router.push(`/admin/surveys/${survey.surveyId}`)
                    }
                  >
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {survey.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {survey.year}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {getStatusBadge(survey.status)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {survey.deadline}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {survey.responseCount}/{survey.recipientCount}
                    </td>
                    <td
                      className="px-4 py-3 text-right text-sm font-medium"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Link
                        href={`/admin/surveys/${survey.surveyId}`}
                        className="text-charcoal-500 hover:text-secondary-400"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
