import Link from 'next/link';

export default function SurveysAdminPage() {
  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">Surveys</h1>
          <p className="mt-2 text-sm text-gray-700">
            Manage firm rankings surveys for Architects, GC&apos;s, and Engineers
          </p>
        </div>
      </div>

      <div className="mt-12 text-center py-12 bg-white shadow rounded-lg">
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
        <h3 className="mt-4 text-lg font-medium text-gray-900">
          Survey Management Coming Soon
        </h3>
        <p className="mt-2 text-sm text-gray-500 max-w-md mx-auto">
          Create and send firm rankings surveys, track responses in real-time,
          and export ranked results for publication.
        </p>
      </div>
    </div>
  );
}
