import Link from 'next/link';

export default function SurveyConfirmationPage() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md mx-auto text-center px-6">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-6">
          <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-2xl font-heading font-bold text-navy-500">
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
            className="text-sm text-charcoal-500 hover:text-secondary-400 font-medium transition-colors"
          >
            Return to UC&amp;D Tools
          </Link>
        </div>
      </div>
    </main>
  );
}
