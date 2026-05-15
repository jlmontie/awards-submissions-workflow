'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';

export default function SurveyConfirmationPage() {
  const params = useParams();
  const search = useSearchParams();
  const token = params.token as string;
  const wasEdit = search.get('edited') === '1';

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md mx-auto text-center px-6">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-6">
          <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-2xl font-heading font-bold text-navy-500">
          {wasEdit ? 'Submission Updated' : 'Thank You!'}
        </h1>
        <p className="mt-3 text-gray-600">
          {wasEdit
            ? 'Your changes have been saved.'
            : 'Your survey response has been submitted successfully. We appreciate your participation in the annual firm rankings.'}
        </p>
        <p className="mt-4 text-sm text-gray-500">
          Results will be published in the upcoming issue of{' '}
          <em>Utah Construction + Design</em>.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3">
          <Link
            href={`/surveys/${token}`}
            className="inline-flex items-center justify-center px-6 py-2.5 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 transition-colors"
          >
            Edit Your Submission
          </Link>
        </div>
      </div>
    </main>
  );
}
