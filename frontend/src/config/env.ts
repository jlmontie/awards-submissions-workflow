// Environment variables configuration
// These are embedded at build time

export const config = {
  recaptchaSiteKey: process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || '',
  gcsBucket: process.env.NEXT_PUBLIC_GCS_BUCKET || '',
} as const;
