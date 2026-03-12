import NextAuth, { type NextAuthConfig } from 'next-auth';
import { createAuthConfig } from '@nagiyu/nextjs';

export const authConfig: NextAuthConfig = {
  providers: [],
  trustHost: true,
  ...createAuthConfig({ includeSubAsUserIdFallback: true }),
  pages: {
    signIn: `${process.env.NEXT_PUBLIC_AUTH_URL}/signin`,
  },
};

const nextAuth = NextAuth(authConfig);

export const { handlers, auth, signIn, signOut } = nextAuth;
