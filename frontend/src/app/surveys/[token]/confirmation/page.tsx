import Link from 'next/link';

export default function SurveyConfirmationPage() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md mx-auto text-center px-6">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-6">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900">
          Thank You!
        </h1>
        <p className="mt-3 text-gray-600">
          Your survey response has been submitted successfully. We appreciate your participation
          in the annual firm rankings.
        </p>
        <p className="mt-4 text-sm text-gray-500">
          Results will be published in the upcoming issue of Utah Construction &amp; Design magazine.
        </p>

        <div className="mt-8">
          <Link
            href="/"
            className="text-sm text-amber-600 hover:text-amber-700 font-medium"
          >
            Return to UC&amp;D Tools
          </Link>
        </div>
      </div>
    </main>
  );
}
