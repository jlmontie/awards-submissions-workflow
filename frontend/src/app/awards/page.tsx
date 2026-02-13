'use client';

import { useState } from 'react';
import FileUpload from '@/components/awards/FileUpload';
import SubmissionForm from '@/components/awards/SubmissionForm';
import RecaptchaLoader from '@/components/shared/RecaptchaLoader';

export default function AwardsPage() {
  const [submissionStarted, setSubmissionStarted] = useState(false);

  return (
    <main className="min-h-screen bg-white">
      <RecaptchaLoader />
      {/* Header */}
      <header className="bg-navy-500 shadow-md">
        <div className="max-w-7xl mx-auto px-8 lg:px-12 py-8">
          <div className="flex flex-col items-center mb-6">
            <img
              src="/ucd-logo.png"
              alt="Utah Construction & Design Magazine"
              className="h-20 w-auto mb-4"
            />
          </div>
          <div className="text-center">
            <h1 className="text-4xl lg:text-5xl font-heading font-bold text-white">
              Most Outstanding Projects Competition
            </h1>
            <p className="mt-3 text-white text-lg font-light">
              Submit your project for awards consideration
            </p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-8 lg:px-12 py-16">
        {/* Instructions */}
        <div className="bg-gray-50 border-l-4 border-secondary-400 p-8 mb-12">
          <h2 className="text-4xl font-heading font-bold text-black mb-6">
            Submission Instructions
          </h2>
          <ol className="list-decimal list-inside space-y-3 text-base font-light" style={{ color: '#666' }}>
            <li>
              Download the blank submission form below and fill it out completely
            </li>
            <li>Save your completed form as a PDF</li>
            <li>
              Upload your completed PDF form and project photos (unlimited photos
              accepted)
            </li>
            <li>Submit your entry - you&apos;ll receive a confirmation</li>
          </ol>
        </div>

        {/* Download Form Button */}
        <div className="bg-white border border-gray-200 p-8 mb-12">
          <h3 className="text-2xl font-subheading font-normal text-black mb-6">
            Step 1: Download Blank Form
          </h3>
          <a
            href="/api/awards/download-form"
            download="awards-submission-form.pdf"
            className="inline-flex items-center px-8 py-4 bg-primary-500 text-black font-bold hover:bg-black hover:text-white transition-all duration-300"
          >
            <svg
              className="w-5 h-5 mr-3"
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
        <div className="bg-white border border-gray-200 p-8">
          <h3 className="text-2xl font-subheading font-normal text-black mb-6">
            Step 2: Upload Your Submission
          </h3>

          {!submissionStarted ? (
            <button
              onClick={() => setSubmissionStarted(true)}
              className="inline-flex items-center px-8 py-4 bg-primary-500 text-black font-bold hover:bg-black hover:text-white transition-all duration-300"
            >
              <svg
                className="w-5 h-5 mr-3"
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
        <footer className="mt-16 pt-8 border-t-2 border-secondary-400 text-center">
          <p className="text-base font-light" style={{ color: '#666' }}>
            Need help? Contact us at{' '}
            <a
              href="mailto:awards@example.com"
              className="text-charcoal-500 font-normal hover:text-secondary-400 transition-colors"
            >
              awards@example.com
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}
