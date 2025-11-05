'use client';

import { useState } from 'react';
import FileUpload from '@/components/FileUpload';
import SubmissionForm from '@/components/SubmissionForm';

export default function Home() {
  const [submissionStarted, setSubmissionStarted] = useState(false);

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900">
            Construction Awards Submission
          </h1>
          <p className="mt-2 text-gray-600">
            Submit your project for awards consideration
          </p>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Instructions */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Submission Instructions
          </h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-700">
            <li>
              Download the blank submission form below and fill it out completely
            </li>
            <li>Save your completed form as a PDF</li>
            <li>
              Upload your completed PDF form and project photos (unlimited photos
              accepted)
            </li>
            <li>Submit your entry - you'll receive a confirmation</li>
          </ol>
        </div>

        {/* Download Form Button */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">
            Step 1: Download Blank Form
          </h3>
          <a
            href="/api/download-form"
            download="awards-submission-form.pdf"
            className="inline-flex items-center px-6 py-3 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            <svg
              className="w-5 h-5 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Download Submission Form (PDF)
          </a>
        </div>

        {/* Upload Section */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">
            Step 2: Upload Your Submission
          </h3>
          
          {!submissionStarted ? (
            <button
              onClick={() => setSubmissionStarted(true)}
              className="inline-flex items-center px-6 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors"
            >
              <svg
                className="w-5 h-5 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              Start Upload
            </button>
          ) : (
            <SubmissionForm />
          )}
        </div>

        {/* Footer */}
        <footer className="mt-12 text-center text-gray-600 text-sm">
          <p>
            Need help? Contact us at{' '}
            <a
              href="mailto:awards@example.com"
              className="text-primary-600 hover:text-primary-700"
            >
              awards@example.com
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}

