import Link from 'next/link';

export default function AdminPage() {
  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-heading font-bold text-navy-500">Admin Tools</h1>
        <p className="mt-2 text-sm text-gray-600">
          Select a tool to manage
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
        {/* Awards */}
        <Link
          href="/admin/awards"
          className="group block bg-white border border-gray-200 rounded-lg p-8 hover:border-secondary-400 hover:shadow-lg transition-all duration-300"
        >
          <div className="flex items-center mb-4">
            <svg
              className="w-8 h-8 text-secondary-400 mr-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
              />
            </svg>
            <h2 className="text-2xl font-heading font-bold text-navy-500 group-hover:text-secondary-400 transition-colors">
              Awards
            </h2>
          </div>
          <p className="text-sm text-gray-600">
            Review submissions, select winners, and manage the Most Outstanding Projects awards.
          </p>
        </Link>

        {/* Surveys */}
        <Link
          href="/admin/surveys"
          className="group block bg-white border border-gray-200 rounded-lg p-8 hover:border-secondary-400 hover:shadow-lg transition-all duration-300"
        >
          <div className="flex items-center mb-4">
            <svg
              className="w-8 h-8 text-secondary-400 mr-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            <h2 className="text-2xl font-heading font-bold text-navy-500 group-hover:text-secondary-400 transition-colors">
              Surveys
            </h2>
          </div>
          <p className="text-sm text-gray-600">
            Create and manage firm rankings surveys, generate tokens, and view responses.
          </p>
        </Link>
      </div>
    </div>
  );
}
