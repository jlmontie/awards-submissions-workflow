'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function SignInInner() {
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') ?? '/admin';
  // NextAuth sends unauthorized users here with ?error=AccessDenied when the
  // signIn callback rejects them.
  const denied = params.get('error') === 'AccessDenied';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm max-w-md w-full p-8">
        <h1 className="text-2xl font-heading font-bold text-navy-500 text-center">
          UC+D Admin
        </h1>
        <p className="mt-2 text-sm text-gray-600 text-center">
          Sign in with the Google account tied to your{' '}
          <span className="font-medium">@utahcdmag.com</span> email.
        </p>

        <button
          type="button"
          onClick={() => signIn('google', { callbackUrl })}
          className="mt-8 w-full flex items-center justify-center gap-3 bg-white border border-gray-300 rounded-md px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/>
            <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 013.68 9c0-.593.102-1.17.284-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"/>
          </svg>
          Sign in with Google
        </button>

        {denied && (
          <p className="mt-4 text-sm text-red-600 text-center">
            That Google account isn&apos;t authorized for this portal. Contact the site owner if you think this is a mistake.
          </p>
        )}
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInInner />
    </Suspense>
  );
}
