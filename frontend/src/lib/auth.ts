import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

// utahcdmag.com is not a Google Workspace domain, so we can't trust an `hd`
// (hosted-domain) claim on the Google ID token. Gate by explicit email
// allowlist and require Google itself to have verified the mailbox.
function allowedEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_ALLOWED_EMAILS ?? '')
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/signin',
    error: '/signin',
  },
  callbacks: {
    async signIn({ profile }) {
      const email = profile?.email?.toLowerCase();
      const verified = (profile as { email_verified?: boolean } | undefined)?.email_verified;
      if (!email || !verified) return false;
      return allowedEmails().has(email);
    },
    async session({ session, token }) {
      if (session.user && token.email) {
        session.user.email = token.email;
      }
      return session;
    },
  },
};
