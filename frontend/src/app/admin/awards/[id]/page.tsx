'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Submission {
  [key: string]: string;
}

export default function SubmissionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const awardsId = params.id as string;

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadSubmission();
  }, [awardsId]);

  async function loadSubmission() {
    try {
      const res = await fetch(`/api/awards/admin/submissions/${awardsId}`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setSubmission(data);
      setCategory(data['Winner Category'] || '');
      setNotes(data['Winner Notes'] || '');
    } catch (error) {
      console.error('Error loading submission:', error);
    } finally {
      setLoading(false);
    }
  }

  function getStatusBadge(status: string) {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      winner: 'bg-green-100 text-green-800',
      not_selected: 'bg-gray-100 text-gray-800',
    };
    return (
      <span
        className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
          styles[status as keyof typeof styles] || styles.pending
        }`}
      >
        {status}
      </span>
    );
  }

  if (loading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-12">
        <p className="text-center text-gray-500">Loading submission...</p>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-12">
        <p className="text-center text-gray-500">Submission not found</p>
        <div className="mt-4 text-center">
          <Link href="/admin/awards" className="text-blue-600 hover:text-blue-900">
            &larr; Back to submissions
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/admin/awards"
          className="text-sm text-gray-500 hover:text-gray-700 mb-2 inline-block"
        >
          &larr; Back to submissions
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              {submission['Official Name'] || 'Unnamed Project'}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {submission['Awards ID']} &bull; Submitted {submission['Submission Timestamp']}
            </p>
          </div>
          <div>
            {getStatusBadge(submission.Status || 'pending')}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - 2 columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quick Links */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h2>
            <div className="flex gap-4">
              {submission['PDF Link'] && (
                <a
                  href={submission['PDF Link']}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  View PDF
                </a>
              )}
              {submission['Project Folder'] && (
                <a
                  href={submission['Project Folder']}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  Drive Folder
                </a>
              )}
            </div>
          </div>

          {/* Project Details */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Project Details</h2>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-gray-500">Location</dt>
                <dd className="mt-1 text-sm text-gray-900">{submission.Location || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Category</dt>
                <dd className="mt-1 text-sm text-gray-900">{submission['Project Category or Categories for Consideration'] || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Cost</dt>
                <dd className="mt-1 text-sm text-gray-900">{submission.Cost || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Date Completed</dt>
                <dd className="mt-1 text-sm text-gray-900">{submission['Date Completed'] || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Square Feet</dt>
                <dd className="mt-1 text-sm text-gray-900">{submission['Square Feet'] || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Delivery Method</dt>
                <dd className="mt-1 text-sm text-gray-900">{submission['Delivery Method'] || '-'}</dd>
              </div>
            </dl>
          </div>

          {/* Team Information */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Team</h2>

            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Contact</h3>
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-gray-500">Firm</dt>
                    <dd className="text-gray-900">{submission['Name of Firm'] || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Contact</dt>
                    <dd className="text-gray-900">{submission['Contact Name'] || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Email</dt>
                    <dd className="text-gray-900">{submission.Email || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Phone</dt>
                    <dd className="text-gray-900">{submission['Phone 1'] || '-'}</dd>
                  </div>
                </dl>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Owner</h3>
                <dl className="text-sm space-y-1">
                  <div><span className="text-gray-500">Owner:</span> {submission.Owner || '-'}</div>
                  <div><span className="text-gray-500">Rep/PM:</span> {submission['Owners RepProject Manager'] || '-'}</div>
                </dl>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Design Team</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  {submission.Architect && <div><span className="text-gray-500">Architect:</span> {submission.Architect}</div>}
                  {submission.Structural && <div><span className="text-gray-500">Structural:</span> {submission.Structural}</div>}
                  {submission.Civil && <div><span className="text-gray-500">Civil:</span> {submission.Civil}</div>}
                  {submission.Mechanical && <div><span className="text-gray-500">Mechanical:</span> {submission.Mechanical}</div>}
                  {submission.Electrical && <div><span className="text-gray-500">Electrical:</span> {submission.Electrical}</div>}
                </dl>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Construction Team</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  {submission['General Contractor'] && <div><span className="text-gray-500">GC:</span> {submission['General Contractor']}</div>}
                  {submission.Concrete && <div><span className="text-gray-500">Concrete:</span> {submission.Concrete}</div>}
                  {submission['Steel Fabrication'] && <div><span className="text-gray-500">Steel Fab:</span> {submission['Steel Fabrication']}</div>}
                  {submission.Masonry && <div><span className="text-gray-500">Masonry:</span> {submission.Masonry}</div>}
                </dl>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar - 1 column */}
        <div className="space-y-6">
          {/* Mark as Winner */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Winner Status</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Award Category
                </label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g., Best Concrete Project"
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm px-3 py-2 border"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Judge comments or notes..."
                  rows={3}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm px-3 py-2 border"
                />
              </div>

              <button
                onClick={() => {/* TODO: Implement */}}
                disabled={marking || !category}
                className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {marking ? 'Updating...' : 'Mark as Winner'}
              </button>

              {submission.Status === 'winner' && (
                <button
                  onClick={() => {/* TODO: Implement */}}
                  disabled={marking}
                  className="w-full inline-flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  Remove Winner Status
                </button>
              )}
            </div>
          </div>

          {/* Current Winner Info */}
          {submission.Status === 'winner' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-green-900 mb-2">Current Winner</h3>
              <dl className="text-sm space-y-1">
                <div>
                  <dt className="text-green-700">Category:</dt>
                  <dd className="text-green-900 font-medium">{submission['Winner Category']}</dd>
                </div>
                {submission['Winner Notes'] && (
                  <div>
                    <dt className="text-green-700">Notes:</dt>
                    <dd className="text-green-900">{submission['Winner Notes']}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
