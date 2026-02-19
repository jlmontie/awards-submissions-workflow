'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Survey {
  surveyId: string;
  name: string;
  category: string;
  year: number;
  deadline: string;
  status: string;
  templateId: string;
}

interface Contact {
  contactName: string;
  contactEmail: string;
}

interface Recipient {
  recipientId: string;
  firmName: string;
  token: string;
  status: string;
  sentAt: string;
  remindedAt: string;
  completedAt: string;
  contacts: Contact[];
}

export default function SurveyDetailPage() {
  const params = useParams();
  const surveyId = params.id as string;

  const [survey, setSurvey] = useState<Survey | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusLoading, setStatusLoading] = useState(false);
  const [error, setError] = useState('');
  const [importResult, setImportResult] = useState('');
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedFirms, setExpandedFirms] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  const [emailResult, setEmailResult] = useState('');

  useEffect(() => {
    loadSurvey();
  }, [surveyId]);

  async function loadSurvey() {
    setLoading(true);
    try {
      const res = await fetch(`/api/surveys/admin/${surveyId}`);
      if (!res.ok) throw new Error('Survey not found');
      const data = await res.json();
      setSurvey(data.survey);
      setRecipients(data.recipients);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(newStatus: string) {
    setStatusLoading(true);
    try {
      const res = await fetch(`/api/surveys/admin/${surveyId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      setSurvey((prev) => (prev ? { ...prev, status: newStatus } : prev));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setStatusLoading(false);
    }
  }

  async function handleImport() {
    setImporting(true);
    setImportResult('');
    setError('');
    try {
      const res = await fetch(`/api/surveys/admin/${surveyId}/recipients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Failed to import recipients');
      const data = await res.json();
      setImportResult(
        `Imported ${data.imported} firm${data.imported !== 1 ? 's' : ''}` +
        (data.skipped > 0 ? ` (${data.skipped} already existed, skipped)` : ''),
      );
      await loadSurvey();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  async function handleSendEmail(all: boolean) {
    setActionLoading(true);
    setEmailResult('');
    setError('');
    try {
      const body = all
        ? { all: true }
        : { recipientIds: Array.from(selected) };
      const res = await fetch(`/api/surveys/admin/${surveyId}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send emails');
      }
      const data = await res.json();
      let msg = `Sent to ${data.sent} firm${data.sent !== 1 ? 's' : ''}`;
      if (data.skipped > 0) msg += `, ${data.skipped} skipped (no contacts)`;
      if (data.errors?.length > 0) msg += `. Errors: ${data.errors.join('; ')}`;
      setEmailResult(msg);
      if (!all) setSelected(new Set());
      await loadSurvey();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  function toggleSelect(recipientId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(recipientId)) {
        next.delete(recipientId);
      } else {
        next.add(recipientId);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === recipients.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(recipients.map((r) => r.recipientId)));
    }
  }

  function toggleExpand(recipientId: string) {
    setExpandedFirms((prev) => {
      const next = new Set(prev);
      if (next.has(recipientId)) {
        next.delete(recipientId);
      } else {
        next.add(recipientId);
      }
      return next;
    });
  }

  function getStatusBadge(status: string) {
    const styles: Record<string, string> = {
      draft: 'bg-yellow-100 text-yellow-800',
      active: 'bg-green-100 text-green-800',
      closed: 'bg-gray-100 text-gray-800',
      pending: 'bg-yellow-100 text-yellow-800',
      sent: 'bg-primary-100 text-primary-800',
      in_progress: 'bg-primary-100 text-primary-800',
      completed: 'bg-green-100 text-green-800',
    };
    return (
      <span
        className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
          styles[status] || 'bg-gray-100 text-gray-800'
        }`}
      >
        {status}
      </span>
    );
  }

  function formatDate(dateStr: string) {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleDateString();
  }

  if (loading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="text-center py-12">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
          <p className="mt-2 text-sm text-gray-500">Loading survey...</p>
        </div>
      </div>
    );
  }

  if (!survey) {
    return (
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="text-center py-12">
          <p className="text-gray-500">Survey not found</p>
          <Link
            href="/admin/surveys"
            className="mt-2 inline-flex text-sm text-charcoal-500 hover:text-secondary-400"
          >
            Back to surveys
          </Link>
        </div>
      </div>
    );
  }

  const completedCount = recipients.filter(
    (r) => r.status === 'completed',
  ).length;
  const responseRate =
    recipients.length > 0
      ? Math.round((completedCount / recipients.length) * 100)
      : 0;
  const daysUntilDeadline = survey.deadline
    ? Math.ceil(
        (new Date(survey.deadline).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24),
      )
    : null;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const selectedCompleted = recipients.filter(
    (r) => selected.has(r.recipientId) && r.status === 'completed',
  ).length;
  const selectedSendable = selected.size - selectedCompleted;

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-heading font-semibold text-navy-500">
              {survey.name}
            </h1>
            {getStatusBadge(survey.status)}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {survey.year} &middot; Deadline: {survey.deadline || 'Not set'}
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex gap-2">
          {survey.status === 'draft' && (
            <button
              onClick={() => updateStatus('active')}
              disabled={statusLoading}
              className="inline-flex items-center justify-center rounded-md border border-transparent bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              Activate
            </button>
          )}
          {survey.status === 'active' && (
            <button
              onClick={() => updateStatus('closed')}
              disabled={statusLoading}
              className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Close Survey
            </button>
          )}
          <Link
            href={`/admin/surveys/${surveyId}/results`}
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-navy-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-navy-600 transition-colors"
          >
            Export Results
          </Link>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {importResult && (
        <div className="mt-4 rounded-md bg-green-50 p-4">
          <p className="text-sm text-green-800">{importResult}</p>
        </div>
      )}

      {emailResult && (
        <div className="mt-4 rounded-md bg-blue-50 p-4">
          <p className="text-sm text-blue-800">{emailResult}</p>
        </div>
      )}

      {/* Stats Cards */}
      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-4">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <dt className="text-sm font-medium text-gray-500 truncate">
              Total Firms
            </dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">
              {recipients.length}
            </dd>
          </div>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <dt className="text-sm font-medium text-gray-500 truncate">
              Completed
            </dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">
              {completedCount}
            </dd>
          </div>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <dt className="text-sm font-medium text-gray-500 truncate">
              Response Rate
            </dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">
              {responseRate}%
            </dd>
          </div>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <dt className="text-sm font-medium text-gray-500 truncate">
              Days Until Deadline
            </dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">
              {daysUntilDeadline !== null
                ? daysUntilDeadline > 0
                  ? daysUntilDeadline
                  : 'Past'
                : '--'}
            </dd>
          </div>
        </div>
      </div>

      {/* Import + Bulk Actions */}
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={handleImport}
          disabled={importing}
          className="inline-flex items-center justify-center rounded-md border border-transparent bg-primary-500 px-4 py-2 text-sm font-medium text-black shadow-sm hover:bg-black hover:text-white transition-colors disabled:opacity-50"
        >
          {importing ? 'Importing...' : 'Import Recipients from Contact List'}
        </button>

        {recipients.length > 0 && (
          <button
            onClick={() => handleSendEmail(true)}
            disabled={actionLoading}
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-navy-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-navy-600 transition-colors disabled:opacity-50"
          >
            {actionLoading ? 'Sending...' : 'Email All Firms'}
          </button>
        )}

        {selected.size > 0 && (
          <>
            <button
              onClick={() => handleSendEmail(false)}
              disabled={actionLoading || selectedSendable === 0}
              className="inline-flex items-center justify-center rounded-md border border-transparent bg-primary-500 px-4 py-2 text-sm font-medium text-black shadow-sm hover:bg-black hover:text-white transition-colors disabled:opacity-50"
            >
              {actionLoading ? 'Sending...' : `Send Email (${selectedSendable})`}
            </button>
            {selectedCompleted > 0 && (
              <span className="self-center text-xs text-gray-400 italic">
                {selectedCompleted} completed firm{selectedCompleted !== 1 ? 's' : ''} will be skipped
              </span>
            )}
          </>
        )}
      </div>

      {/* Firm-Level Tracker Table */}
      <div className="mt-6 bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-heading font-medium text-navy-500">
            Firm Tracker
          </h2>
        </div>
        {recipients.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">
              No firms imported yet. Click &quot;Import Recipients from Contact
              List&quot; to get started.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selected.size === recipients.length && recipients.length > 0}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Firm Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    # Contacts
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Sent
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reminded
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Completed
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Survey Link
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {recipients.map((r) => (
                  <>
                    <tr
                      key={r.recipientId}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleExpand(r.recipientId)}
                    >
                      <td
                        className="px-4 py-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(r.recipientId)}
                          onChange={() => toggleSelect(r.recipientId)}
                          className="h-4 w-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                        <div className="flex items-center gap-1">
                          <svg
                            className={`h-4 w-4 text-gray-400 transition-transform ${
                              expandedFirms.has(r.recipientId) ? 'rotate-90' : ''
                            }`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                          {r.firmName}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {r.contacts.length}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {getStatusBadge(r.status)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatDate(r.sentAt)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatDate(r.remindedAt)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatDate(r.completedAt)}
                      </td>
                      <td
                        className="px-4 py-3 text-sm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <code className="bg-gray-100 px-2 py-1 rounded text-xs break-all">
                          {origin}/surveys/{r.token}
                        </code>
                      </td>
                    </tr>
                    {/* Expanded contacts row */}
                    {expandedFirms.has(r.recipientId) && r.contacts.length > 0 && (
                      <tr key={`${r.recipientId}-contacts`}>
                        <td colSpan={8} className="px-4 py-0">
                          <div className="ml-10 py-2 border-l-2 border-secondary-400 pl-4">
                            <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                              Contacts at {r.firmName}
                            </p>
                            <div className="space-y-1">
                              {r.contacts.map((c, i) => (
                                <div key={i} className="text-sm text-gray-600">
                                  {c.contactName}{' '}
                                  <span className="text-gray-400">
                                    &lt;{c.contactEmail}&gt;
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
