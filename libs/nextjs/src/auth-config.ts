import type { NextAuthConfig } from 'next-auth';

const AUTH_SESSION_MAX_AGE = 30 * 24 * 60 * 60;

export interface CreateAuthCallbacksOptions {
  includeSubAsUserIdFallback?: boolean;
  jwt?: NonNullable<NextAuthConfig['callbacks']>['jwt'];
}

export interface CreateAuthConfigOptions extends CreateAuthCallbacksOptions {
  nodeEnv?: string;
}

export function createAuthSessionConfig(): NonNullable<NextAuthConfig['session']> {
  return {
    strategy: 'jwt',
    maxAge: AUTH_SESSION_MAX_AGE,
  };
}

export function createAuthCookieOptions(nodeEnv = process.env.NODE_ENV): {
  httpOnly: true;
  sameSite: 'lax';
  path: '/';
  domain: string | undefined;
  secure: boolean;
} {
  const isDevelopment = nodeEnv === 'development';

  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    domain: isDevelopment ? undefined : '.nagiyu.com',
    secure: !isDevelopment,
  };
}

export function createAuthCookies(
  nodeEnv = process.env.NODE_ENV
): NonNullable<NextAuthConfig['cookies']> {
  const cookieOptions = createAuthCookieOptions(nodeEnv);
  const isDevelopment = nodeEnv === 'development';
  const isProduction = nodeEnv === 'prod';
  const cookieSuffix = isProduction ? '' : isDevelopment ? '' : '.dev';

  return {
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
  };
}

export function createAuthCallbacks(
  options: CreateAuthCallbacksOptions = {}
): NonNullable<NextAuthConfig['callbacks']> {
  const { includeSubAsUserIdFallback = false, jwt } = options;

  return {
    async jwt(params) {
      if (jwt) {
        return await jwt(params);
      }
      return params.token;
    },
    async session({ session, token }) {
      const fallbackId = includeSubAsUserIdFallback ? (token.sub as string) : '';
      session.user.id = (token.userId as string) || fallbackId || '';
      session.user.email = (token.email as string) || '';
      session.user.name = (token.name as string) || '';
      session.user.image = (token.picture as string) || undefined;
      session.user.roles = (token.roles as string[]) || [];
      return session;
    },
  };
}

export function createAuthConfig(
  options: CreateAuthConfigOptions = {}
): Pick<NextAuthConfig, 'session' | 'cookies' | 'callbacks'> {
  const { nodeEnv, includeSubAsUserIdFallback, jwt } = options;

  return {
    session: createAuthSessionConfig(),
    cookies: createAuthCookies(nodeEnv),
    callbacks: createAuthCallbacks({ includeSubAsUserIdFallback, jwt }),
  };
}
