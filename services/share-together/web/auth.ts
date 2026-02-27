import NextAuth, { type NextAuthConfig } from 'next-auth';

const nodeEnv = String(process.env.NODE_ENV ?? '');
const isDevelopment = nodeEnv === 'development';
const isProduction = nodeEnv === 'production' || nodeEnv === 'prod';

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  domain: isDevelopment ? undefined : '.nagiyu.com',
  secure: !isDevelopment,
};

const cookieSuffix = isDevelopment || isProduction ? '' : '.dev';

export const authConfig: NextAuthConfig = {
  providers: [],
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  trustHost: true,
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
  cookies: {
    sessionToken: {
      name: `__Secure-authjs.session-token${cookieSuffix}`,
      options: cookieOptions,
    },
    callbackUrl: {
      name: `__Secure-authjs.callback-url${cookieSuffix}`,
      options: cookieOptions,
    },
    csrfToken: {
      name: `__Host-authjs.csrf-token${cookieSuffix}`,
      options: {
        ...cookieOptions,
        domain: undefined,
      },
    },
    state: {
      name: `__Secure-authjs.state${cookieSuffix}`,
      options: cookieOptions,
    },
    pkceCodeVerifier: {
      name: `__Secure-authjs.pkce.code_verifier${cookieSuffix}`,
      options: cookieOptions,
    },
    nonce: {
      name: `__Secure-authjs.nonce${cookieSuffix}`,
      options: cookieOptions,
    },
  },
  callbacks: {
    async jwt({ token }) {
      return token;
    },
    async session({ session, token }) {
      session.user.id = (token.userId as string) || (token.sub as string) || '';
      return session;
    },
  },
  pages: {
    signIn: `${process.env.NEXT_PUBLIC_AUTH_URL}/signin`,
  },
};

const nextAuth = NextAuth(authConfig);

export const { handlers, auth, signIn, signOut } = nextAuth;
