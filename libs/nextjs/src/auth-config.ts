import type { NextAuthConfig } from 'next-auth';

const AUTH_SESSION_MAX_AGE = 30 * 24 * 60 * 60;

export type AuthCookieOptions = {
  httpOnly: true;
  sameSite: 'lax';
  path: '/';
  domain: string | undefined;
  secure: boolean;
};

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

export function createAuthCookieOptions(nodeEnv = process.env.NODE_ENV): AuthCookieOptions {
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

/**
 * 共通の NextAuth callbacks を生成する。
 * カスタム `jwt` を指定した場合はその戻り値を利用し、`session` コールバックでは
 * 生成された token から user 情報を復元する（`includeSubAsUserIdFallback` は userId 未設定時のみ適用）。
 *
 * @param options - callback の動作を制御するオプション
 * @param options.includeSubAsUserIdFallback - true の場合、`token.userId` 未設定時に `token.sub` を `session.user.id` へフォールバックする
 * @param options.jwt - カスタム JWT callback。未指定時は `params.token` をそのまま返す
 * @returns 共通化済みの NextAuth callbacks
 */
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
