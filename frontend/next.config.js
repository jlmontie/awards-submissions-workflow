/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,

  // Increase static page generation timeout for API routes during build
  staticPageGenerationTimeout: 120, // seconds

  // pdfkit reads its standard-font metric files (*.afm) from disk at runtime.
  // Next's standalone output tracing doesn't detect these dynamic reads, so the
  // routes that generate submission PDFs would crash in production. Force the
  // data directory to be bundled alongside those routes.
  experimental: {
    outputFileTracingIncludes: {
      '/api/surveys/responses/**': ['./node_modules/pdfkit/js/data/**/*'],
    },
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

