console.log('NEXT_PUBLIC_RECAPTCHA_SITE_KEY:', process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY);
console.log('NEXT_PUBLIC_GCS_BUCKET:', process.env.NEXT_PUBLIC_GCS_BUCKET);
console.log('All NEXT_PUBLIC vars:', Object.keys(process.env).filter(k => k.startsWith('NEXT_PUBLIC')));
