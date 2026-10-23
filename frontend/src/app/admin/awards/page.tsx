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
  // '' until the award years load; 'all' for every year.
  const yearParam = searchParams.get('year');
  const [defaultYear, setDefaultYear] = useState('');
  const [years, setYears] = useState<string[]>([]);
  const year = yearParam || defaultYear;

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  useEffect(() => {
    loadYears();
  }, []);

  useEffect(() => {
    if (year) loadSubmissions();
  }, [filter, year]);

  // Defaults to the year taking entries, else the latest one. Before any
  // award year exists, every submission is shown.
  async function loadYears() {
    try {
      const res = await fetch('/api/awards/admin/years');
      const data = await res.json();
      const list: string[] = (data.years || []).map((y: { year: string }) => y.year);
      setYears(list);
      setDefaultYear(data.window?.accepting ? data.window.year : list[0] || 'all');
    } catch (error) {
      console.error('Error loading award years:', error);
      setDefaultYear('all');
    }
  }

  function yearQuery() {
    return year && year !== 'all' ? `&year=${year}` : '';
  }

  function navigate(next: { filter?: string; year?: string }) {
    const params = new URLSearchParams({ filter: next.filter ?? filter, year: next.year ?? year });
    router.push(`/admin/awards?${params}`);
  }

  async function loadSubmissions() {
    setLoading(true);
    try {
      const res = await fetch(`/api/awards/admin/submissions?filter=${filter}${yearQuery()}`);
      const data = await res.json();
      setSubmissions(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading submissions:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setExportError('');
    try {
      const res = await fetch(`/api/awards/admin/export?${yearQuery().slice(1)}`);
      if (!res.ok) throw new Error('Export failed. Please try again.');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ||
        'awards-submissions-by-category.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setExportError(err.message);
    } finally {
      setExporting(false);
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
            {year && year !== 'all' ? `${year} awards submissions` : 'All awards submissions'} for
            review and management
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex sm:flex-none sm:gap-3">
          <button
            onClick={handleExport}
            disabled={exporting}
            title="One row per project category, as an Excel table"
            className="inline-flex items-center rounded-md bg-navy-500 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-navy-600 disabled:opacity-50"
          >
            {exporting ? 'Exporting…' : 'Export by Category (.xlsx)'}
          </button>
          <Link
            href="/admin/awards/years"
            className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          >
            Award Years
          </Link>
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

      {exportError && (
        <p className="mt-4 text-sm text-red-600">{exportError}</p>
      )}

      {/* Filters */}
      <div className="mt-4 flex flex-col sm:flex-row gap-4">
        <select
          aria-label="Award year"
          value={year}
          onChange={(e) => navigate({ year: e.target.value })}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm"
        >
          {(year && year !== 'all' && !years.includes(year) ? [year, ...years] : years).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
          <option value="all">All years</option>
        </select>
        <div className="flex rounded-md shadow-sm">
          <button
            onClick={() => navigate({ filter: 'all' })}
            className={`relative inline-flex items-center rounded-l-md px-3 py-2 text-sm font-semibold ring-1 ring-inset ring-gray-300 ${
              filter === 'all'
                ? 'bg-navy-500 text-white'
                : 'bg-white text-gray-900 hover:bg-gray-50'
            }`}
          >
            All ({submissions.length})
          </button>
          <button
            onClick={() => navigate({ filter: 'pending' })}
            className={`relative -ml-px inline-flex items-center px-3 py-2 text-sm font-semibold ring-1 ring-inset ring-gray-300 ${
              filter === 'pending'
                ? 'bg-navy-500 text-white'
                : 'bg-white text-gray-900 hover:bg-gray-50'
            }`}
          >
            Pending
          </button>
          <button
            onClick={() => navigate({ filter: 'winners' })}
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
