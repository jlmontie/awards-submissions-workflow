'use client';

import { useState } from 'react';
import FileUpload from './FileUpload';
import { v4 as uuidv4 } from 'uuid';

interface SubmissionStatus {
  status: 'idle' | 'uploading' | 'processing' | 'success' | 'error';
  message?: string;
  submissionId?: string;
  driveLink?: string;
}

export default function SubmissionForm() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>({
    status: 'idle',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate
    if (!pdfFile) {
      alert('Please upload a PDF submission form');
      return;
    }

    if (photoFiles.length === 0) {
      alert('Please upload at least one project photo');
      return;
    }

    try {
      setSubmissionStatus({ status: 'uploading', message: 'Preparing upload...' });

      // Verify reCAPTCHA
      const recaptchaToken = await executeRecaptcha();
      
      // Generate submission ID
      const submissionId = uuidv4();
      const now = new Date();
      const year = now.getFullYear().toString();
      const month = (now.getMonth() + 1).toString().padStart(2, '0');

      setSubmissionStatus({
        status: 'uploading',
        message: `Uploading PDF...`,
      });

      // Upload PDF
      await uploadFile(pdfFile, submissionId, year, month, 'pdf', recaptchaToken);

      setSubmissionStatus({
        status: 'uploading',
        message: `Uploading ${photoFiles.length} photos...`,
      });

      // Upload photos in parallel (with concurrency limit)
      await uploadPhotosInBatches(photoFiles, submissionId, year, month, recaptchaToken);

      // Finalize submission
      setSubmissionStatus({
        status: 'processing',
        message: 'Processing your submission...',
      });

      // Wait a bit for processing
      await new Promise(resolve => setTimeout(resolve, 3000));

      setSubmissionStatus({
        status: 'success',
        message: 'Submission successful!',
        submissionId,
      });

    } catch (error: any) {
      console.error('Submission error:', error);
      setSubmissionStatus({
        status: 'error',
        message: error.message || 'Failed to submit. Please try again.',
      });
    }
  };

  const executeRecaptcha = async (): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.grecaptcha) {
        reject(new Error('reCAPTCHA not loaded'));
        return;
      }

      window.grecaptcha.ready(() => {
        window.grecaptcha
          .execute(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY!, {
            action: 'submit',
          })
          .then(resolve)
          .catch(reject);
      });
    });
  };

  const uploadFile = async (
    file: File,
    submissionId: string,
    year: string,
    month: string,
    type: 'pdf' | 'photos',
    recaptchaToken: string
  ) => {
    // Get signed URL from API
    const response = await fetch('/api/get-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type,
        submissionId,
        year,
        month,
        type,
        recaptchaToken,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to get upload URL');
    }

    const { uploadUrl } = await response.json();

    // Upload directly to GCS
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type,
      },
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new Error(`Failed to upload ${file.name}`);
    }
  };

  const uploadPhotosInBatches = async (
    photos: File[],
    submissionId: string,
    year: string,
    month: string,
    recaptchaToken: string
  ) => {
    const BATCH_SIZE = 3; // Upload 3 photos at a time
    
    for (let i = 0; i < photos.length; i += BATCH_SIZE) {
      const batch = photos.slice(i, i + BATCH_SIZE);
      
      setSubmissionStatus({
        status: 'uploading',
        message: `Uploading photos ${i + 1}-${Math.min(i + BATCH_SIZE, photos.length)} of ${photos.length}...`,
      });

      await Promise.all(
        batch.map(photo =>
          uploadFile(photo, submissionId, year, month, 'photos', recaptchaToken)
        )
      );
    }
  };

  const handleReset = () => {
    setPdfFile(null);
    setPhotoFiles([]);
    setSubmissionStatus({ status: 'idle' });
  };

  if (submissionStatus.status === 'success') {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
          <svg
            className="w-8 h-8 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h3 className="text-2xl font-bold text-gray-900 mb-2">
          Submission Successful!
        </h3>
        <p className="text-gray-600 mb-4">{submissionStatus.message}</p>
        <p className="text-sm text-gray-500 mb-6">
          Submission ID: <code className="bg-gray-100 px-2 py-1 rounded">{submissionStatus.submissionId}</code>
        </p>
        <button
          onClick={handleReset}
          className="px-6 py-3 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          Submit Another Entry
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* PDF Upload */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Completed PDF Form *
        </label>
        <FileUpload
          accept=".pdf,application/pdf"
          maxFiles={1}
          onFilesSelected={(files) => setPdfFile(files[0])}
          disabled={submissionStatus.status !== 'idle'}
        />
        {pdfFile && (
          <p className="mt-2 text-sm text-green-600">
            ✓ {pdfFile.name} ({(pdfFile.size / 1024 / 1024).toFixed(2)} MB)
          </p>
        )}
      </div>

      {/* Photo Upload */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Project Photos * (Unlimited)
        </label>
        <FileUpload
          accept="image/*"
          maxFiles={999}
          multiple
          onFilesSelected={(files) => setPhotoFiles(files)}
          disabled={submissionStatus.status !== 'idle'}
        />
        {photoFiles.length > 0 && (
          <div className="mt-2">
            <p className="text-sm text-green-600 mb-2">
              ✓ {photoFiles.length} photo{photoFiles.length !== 1 ? 's' : ''} selected
            </p>
            <div className="max-h-32 overflow-y-auto text-xs text-gray-600">
              {photoFiles.map((file, idx) => (
                <div key={idx}>
                  {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Status Message */}
      {submissionStatus.status !== 'idle' && (
        <div
          className={`p-4 rounded-lg ${
            submissionStatus.status === 'error'
              ? 'bg-red-50 text-red-800'
              : 'bg-blue-50 text-blue-800'
          }`}
        >
          <p className="font-medium">{submissionStatus.message}</p>
        </div>
      )}

      {/* Submit Button */}
      <div className="flex gap-4">
        <button
          type="submit"
          disabled={
            !pdfFile ||
            photoFiles.length === 0 ||
            submissionStatus.status !== 'idle'
          }
          className="flex-1 px-6 py-3 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {submissionStatus.status === 'idle' ? 'Submit Entry' : 'Processing...'}
        </button>
        
        {submissionStatus.status === 'idle' && (pdfFile || photoFiles.length > 0) && (
          <button
            type="button"
            onClick={handleReset}
            className="px-6 py-3 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* reCAPTCHA Notice */}
      <p className="text-xs text-gray-500 text-center">
        This site is protected by reCAPTCHA and the Google{' '}
        <a href="https://policies.google.com/privacy" className="underline">
          Privacy Policy
        </a>{' '}
        and{' '}
        <a href="https://policies.google.com/terms" className="underline">
          Terms of Service
        </a>{' '}
        apply.
      </p>
    </form>
  );
}

// Extend Window interface for reCAPTCHA
declare global {
  interface Window {
    grecaptcha: any;
  }
}

