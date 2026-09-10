import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Route guard for admin surfaces. API routes get JSON 401 (so client fetches
// fail cleanly), page routes get a redirect to /signin.
export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (token) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const signInUrl = new URL('/signin', req.url);
  signInUrl.searchParams.set('callbackUrl', pathname + search);
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: [
    '/admin',
    '/admin/:path*',
    '/api/awards/admin/:path*',
    '/api/surveys/admin/:path*',
  ],
};
