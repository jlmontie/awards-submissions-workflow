'use client';

import { useEffect } from 'react';
import { config } from '@/config/env';

export default function RecaptchaLoader() {
  useEffect(() => {
    const siteKey = config.recaptchaSiteKey;

    if (!siteKey) {
      console.warn('reCAPTCHA site key not configured');
      return;
    }

    // Check if script is already loaded
    if (document.querySelector('script[src*="recaptcha"]')) {
      return;
    }

    // Load reCAPTCHA script
    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, []);

  return null;
}
