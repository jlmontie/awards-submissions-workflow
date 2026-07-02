/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,

  // Increase static page generation timeout for API routes during build
  staticPageGenerationTimeout: 120, // seconds

  experimental: {
    // pdfkit reads its standard-font metric files (*.afm) via
    // `__dirname + '/data/<font>.afm'` at runtime. If webpack bundles pdfkit
    // into the route chunk, `__dirname` resolves to `.next/server/chunks` and
    // those reads fail (ENOENT), crashing PDF generation. Keep pdfkit external
    // so it's required from node_modules and `__dirname` stays valid.
    serverComponentsExternalPackages: ['pdfkit'],
    // Belt-and-suspenders for the standalone (Docker) output: ensure the font
    // data directory is copied even though the reads are dynamic.
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

