import NextAuth, { type NextAuthConfig } from 'next-auth';
import { createServiceAuthConfig } from '@nagiyu/nextjs';

export const authConfig: NextAuthConfig = {
  providers: [],
  trustHost: true,
  ...createServiceAuthConfig({ includeSubAsUserIdFallback: true }),
};

const nextAuth = NextAuth(authConfig);

export const { handlers, auth, signIn, signOut } = nextAuth;
