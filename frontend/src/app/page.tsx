import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-white">
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
              UC&D Tools
            </h1>
            <p className="mt-3 text-white text-lg font-light">
              Utah Construction & Design
            </p>
          </div>
        </div>
      </header>

      {/* Tool Cards */}
      <div className="max-w-7xl mx-auto px-8 lg:px-12 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Awards Submissions */}
          <Link
            href="/awards"
            className="group block bg-white border border-gray-200 p-8 hover:border-secondary-400 hover:shadow-lg transition-all duration-300"
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
              <h2 className="text-2xl font-heading font-bold text-black group-hover:text-secondary-400 transition-colors">
                Awards Submissions
              </h2>
            </div>
            <p className="text-base font-light" style={{ color: '#666' }}>
              Submit your project for the Most Outstanding Projects competition. Upload your completed submission form and project photos.
            </p>
          </Link>

          {/* Firm Rankings Survey */}
          <div
            className="block bg-white border border-gray-200 p-8 opacity-75"
          >
            <div className="flex items-center mb-4">
              <svg
                className="w-8 h-8 text-gray-400 mr-3"
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
              <h2 className="text-2xl font-heading font-bold text-black">
                Firm Rankings Survey
              </h2>
            </div>
            <p className="text-base font-light" style={{ color: '#666' }}>
              Annual firm rankings surveys for Architects, GC&apos;s, and Engineers. Access your survey via the unique link sent to your email.
            </p>
            <p className="mt-4 text-sm font-medium text-gray-400">
              Coming Soon
            </p>
          </div>
        </div>

        {/* Admin Link */}
        <div className="mt-16 text-center">
          <Link
            href="/admin"
            className="text-sm font-light hover:text-secondary-400 transition-colors"
            style={{ color: '#999' }}
          >
            Admin Portal
          </Link>
        </div>
      </div>
    </main>
  );
}
