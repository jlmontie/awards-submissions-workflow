'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Submission {
  awardsId: string;
  status: string;
  projectName: string;
  firm: string;
  category: string;
  submittedAt: string;
  winnerCategory?: string;
  pdfLink?: string;
  folderLink?: string;
}

function SubmissionsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filter = searchParams.get('filter') || 'all';

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadSubmissions();
  }, [filter]);

  async function loadSubmissions() {
    setLoading(true);
    try {
      const res = await fetch(`/api/awards/admin/submissions?filter=${filter}`);
      const data = await res.json();
      setSubmissions(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading submissions:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredSubmissions = submissions.filter((s) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      s.awardsId.toLowerCase().includes(searchLower) ||
      s.projectName.toLowerCase().includes(searchLower) ||
      s.firm.toLowerCase().includes(searchLower)
    );
  });

  function getStatusBadge(status: string) {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      winner: 'bg-green-100 text-green-800',
      not_selected: 'bg-gray-100 text-gray-800',
    };
    return (
      <span
        className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
          styles[status as keyof typeof styles] || styles.pending
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
          <h1 className="text-2xl font-heading font-semibold text-navy-500">Submissions</h1>
          <p className="mt-2 text-sm text-gray-700">
            All awards submissions for review and management
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
          <Link
            href="/awards"
            target="_blank"
            className="inline-flex items-center gap-1 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          >
            Public Submissions Page
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-col sm:flex-row gap-4">
        <div className="flex rounded-md shadow-sm">
          <button
            onClick={() => router.push('/admin/awards?filter=all')}
            className={`relative inline-flex items-center rounded-l-md px-3 py-2 text-sm font-semibold ring-1 ring-inset ring-gray-300 ${
              filter === 'all'
                ? 'bg-navy-500 text-white'
                : 'bg-white text-gray-900 hover:bg-gray-50'
            }`}
          >
            All ({submissions.length})
          </button>
          <button
            onClick={() => router.push('/admin/awards?filter=pending')}
            className={`relative -ml-px inline-flex items-center px-3 py-2 text-sm font-semibold ring-1 ring-inset ring-gray-300 ${
              filter === 'pending'
                ? 'bg-navy-500 text-white'
                : 'bg-white text-gray-900 hover:bg-gray-50'
            }`}
          >
            Pending
          </button>
          <button
            onClick={() => router.push('/admin/awards?filter=winners')}
            className={`relative -ml-px inline-flex items-center rounded-r-md px-3 py-2 text-sm font-semibold ring-1 ring-inset ring-gray-300 ${
              filter === 'winners'
                ? 'bg-navy-500 text-white'
                : 'bg-white text-gray-900 hover:bg-gray-50'
            }`}
          >
            Winners
          </button>
        </div>

        <div className="flex-1">
          <input
            type="text"
            placeholder="Search by ID, project name, or firm..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm px-4 py-2 border"
          />
        </div>
      </div>

      {/* Submissions Table */}
      <div className="mt-8 bg-white shadow rounded-lg overflow-hidden">
        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Loading submissions...</p>
          </div>
        ) : filteredSubmissions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No submissions found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Awards ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Project Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Firm
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredSubmissions.map((submission) => (
                  <tr key={submission.awardsId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono text-gray-900 whitespace-nowrap">
                      {submission.awardsId}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 max-w-xs">
                      <div className="truncate" title={submission.projectName}>
                        {submission.projectName}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-xs">
                      <div className="truncate" title={submission.firm}>
                        {submission.firm}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-sm">
                      <div className="truncate" title={submission.category}>
                        {submission.category}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      {getStatusBadge(submission.status)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium whitespace-nowrap">
                      <Link
                        href={`/admin/awards/${submission.awardsId}`}
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

export default function AwardsAdminPage() {
  return (
    <Suspense fallback={
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="text-center py-12">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
          <p className="mt-2 text-sm text-gray-500">Loading submissions...</p>
        </div>
      </div>
    }>
      <SubmissionsContent />
    </Suspense>
  );
}
