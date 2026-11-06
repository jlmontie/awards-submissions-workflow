'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { isWinner } from '@/lib/awards/sheet-rows';

interface Submission {
  awardsId: string;
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
  const [exporting, setExporting] = useState<'category' | 'team' | null>(null);
  const [exportError, setExportError] = useState('');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadYears();
  }, []);

  useEffect(() => {
    if (year) loadSubmissions();
  }, [year]);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const closeOnOutsideClick = (e: MouseEvent) => {
      if (!exportMenu.current?.contains(e.target as Node)) setExportMenuOpen(false);
    };
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportMenuOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [exportMenuOpen]);

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
      const res = await fetch(`/api/awards/admin/submissions?${yearQuery().slice(1)}`);
      const data = await res.json();
      setSubmissions(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading submissions:', error);
    } finally {
      setLoading(false);
    }
  }

  async function download(kind: 'category' | 'team', path: string, fallbackName: string) {
    setExportMenuOpen(false);
    setExporting(kind);
    setExportError('');
    try {
      const res = await fetch(`${path}?${yearQuery().slice(1)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Export failed. Please try again.');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || fallbackName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setExportError(err.message);
    } finally {
      setExporting(null);
    }
  }

  const winners = submissions.filter((s) => isWinner(s.winnerCategory));

  const filteredSubmissions = (filter === 'winners' ? winners : submissions).filter((s) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      s.awardsId.toLowerCase().includes(searchLower) ||
      s.projectName.toLowerCase().includes(searchLower) ||
      s.firm.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-heading font-semibold text-navy-500">Submissions</h1>
          <p className="mt-2 text-sm text-gray-700">
            {year && year !== 'all' ? `${year} awards submissions` : 'Awards submissions in the shared sheet'} for
            review and management
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex sm:flex-none sm:gap-3">
          <div ref={exportMenu} className="relative">
            <button
              onClick={() => setExportMenuOpen((open) => !open)}
              disabled={exporting !== null}
              aria-haspopup="menu"
              aria-expanded={exportMenuOpen}
              className="inline-flex items-center gap-1 rounded-md bg-navy-500 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-navy-600 disabled:opacity-50"
            >
              {exporting ? 'Exporting…' : 'Export'}
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {exportMenuOpen && (
              <div
                role="menu"
                className="absolute left-0 sm:left-auto sm:right-0 z-10 mt-2 w-72 rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5"
              >
                <button
                  role="menuitem"
                  onClick={() =>
                    download('category', '/api/awards/admin/export', 'awards-submissions-by-category.xlsx')
                  }
                  className="block w-full px-4 py-2 text-left hover:bg-gray-50"
                >
                  <span className="block text-sm font-semibold text-gray-900">Submissions by Category</span>
                  <span className="block text-xs text-gray-500">One row per project category (.xlsx)</span>
                </button>
                <button
                  role="menuitem"
                  onClick={() =>
                    download('team', '/api/awards/admin/project-team-export', 'awards-winners-project-team.xlsx')
                  }
                  disabled={winners.length === 0}
                  className="block w-full px-4 py-2 text-left hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
                >
                  <span className="block text-sm font-semibold text-gray-900">Winner Project Teams</span>
                  <span className="block text-xs text-gray-500">
                    Available once winners are entered in the sheet’s Winner Category column (.xlsx)
                  </span>
                </button>
              </div>
            )}
          </div>
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
          <option value="all">Shared sheet (older years)</option>
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
            onClick={() => navigate({ filter: 'winners' })}
            className={`relative -ml-px inline-flex items-center rounded-r-md px-3 py-2 text-sm font-semibold ring-1 ring-inset ring-gray-300 ${
              filter === 'winners'
                ? 'bg-navy-500 text-white'
                : 'bg-white text-gray-900 hover:bg-gray-50'
            }`}
          >
            Winners ({winners.length})
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
                    Winner
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
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                      {submission.winnerCategory}
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
