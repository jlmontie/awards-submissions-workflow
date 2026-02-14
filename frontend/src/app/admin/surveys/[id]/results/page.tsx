'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface ExportData {
  utah: string;
  outOfState: string | null;
}

interface FirmPreview {
  firmName: string;
  revenue: string;
  employees: string;
  topMarket: string;
  isDnd: boolean;
  isOutOfState: boolean;
}

const MARKET_DISPLAY_NAMES: Record<string, string> = {
  pct_k12: 'K-12',
  pct_higher_ed: 'Higher Ed',
  pct_civic: 'Civic/Inst.',
  pct_healthcare: 'Healthcare',
  pct_office: 'Office',
  pct_resort_hospitality: 'Resort/Hosp.',
  pct_multi_family: 'Multi-Family',
  pct_commercial_retail: 'Comm/Retail',
  pct_sports_rec: 'Sports/Rec',
  pct_industrial: 'Industrial',
  pct_other: 'Other',
};

export default function ResultsPage() {
  const params = useParams();
  const surveyId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [firms, setFirms] = useState<FirmPreview[]>([]);
  const [surveyName, setSurveyName] = useState('');

  useEffect(() => {
    loadResults();
  }, [surveyId]);

  async function loadResults() {
    setLoading(true);
    setError('');
    try {
      // Load survey detail for name
      const detailRes = await fetch(`/api/surveys/admin/${surveyId}`);
      if (detailRes.ok) {
        const detail = await detailRes.json();
        setSurveyName(detail.survey.name);
      }

      // Load export data as JSON for preview
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

      const data: ExportData = await res.json();

      // Parse the text to extract firm data for preview table
      const firmsList = parseExportForPreview(data.utah);
      setFirms(firmsList);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function parseExportForPreview(text: string): FirmPreview[] {
    // The export text has firm blocks of 3 lines each separated by blank lines.
    // Each block: line 1 = firm data, line 2 = address, line 3 = city/state.
    // We only need line 1 of each block.
    const lines = text.split('\n');
    const previews: FirmPreview[] = [];
    let inDndSection = false;

    // Collect non-empty line groups separated by blank lines
    let block: string[] = [];
    for (let i = 0; i <= lines.length; i++) {
      const line = i < lines.length ? lines[i] : '';
      if (!line.trim()) {
        if (block.length > 0) {
          // Check first line of block for DND section marker
          if (block[0].includes('Did Not Disclose Revenues')) {
            inDndSection = true;
            block = [];
            continue;
          }

          // Skip header/metadata blocks
          const first = block[0];
          if (
            first.startsWith('\t') ||
            first.includes('Top Utah Architectural') ||
            first.includes('pleased to publish') ||
            first.includes('Firm Name\t') ||
            first.includes('Out of State')
          ) {
            block = [];
            continue;
          }

          // Parse first line of firm block: name, phone, year, exec, project, employees, rev, rev, rev, market, %
          const cols = first.split('\t');
          if (cols.length >= 7 && cols[0]) {
            previews.push({
              firmName: cols[0],
              revenue: cols[6] || '',
              employees: cols[5] || '',
              topMarket: cols[9] || '',
              isDnd: inDndSection || cols[6] === 'DND',
              isOutOfState: false,
            });
          }

          block = [];
        }
      } else {
        block.push(line);
      }
    }

    return previews;
  }

  async function handleDownload() {
    try {
      const res = await fetch(`/api/surveys/admin/${surveyId}/export`);
      if (!res.ok) throw new Error('Failed to download');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ||
        'export.txt';
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
          <button
            onClick={handleDownload}
            disabled={!!error}
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-primary-500 px-4 py-2 text-sm font-medium text-black shadow-sm hover:bg-black hover:text-white transition-colors disabled:opacity-50"
          >
            Download Export (.txt)
          </button>
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
      ) : (
        /* Ranked Table Preview */
        <div className="mt-8 bg-white shadow rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-heading font-medium text-navy-500">
              Ranked Firms ({firms.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Firm Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Revenue
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Employees
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Top Market
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {firms.map((firm, i) => {
                  // Check if this is the transition from revenue to DND
                  const prevFirm = i > 0 ? firms[i - 1] : null;
                  const showSeparator =
                    firm.isDnd && prevFirm && !prevFirm.isDnd;

                  return (
                    <>
                      {showSeparator && (
                        <tr key={`sep-${i}`}>
                          <td
                            colSpan={5}
                            className="px-4 py-2 text-xs font-medium text-gray-500 bg-gray-100 uppercase"
                          >
                            Did Not Disclose Revenues (by # employees)
                          </td>
                        </tr>
                      )}
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {i + 1}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {firm.firmName}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {firm.revenue}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {firm.employees}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {firm.topMarket}
                        </td>
                      </tr>
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
