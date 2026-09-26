import type { NextAuthConfig } from 'next-auth';

const AUTH_SESSION_MAX_AGE = 30 * 24 * 60 * 60;

/**
 * Cookie domain 定数
 *
 * - prod（NAGIYU_ENV === 'prod' または未設定）: `.nagiyu.com`
 * - development（ローカル開発、NODE_ENV === 'development'）: 未設定（undefined）
 * - dev（デプロイ済み dev 環境、NAGIYU_ENV === 'dev'）: `.dev.nagiyu.com`
 */
const AUTH_COOKIE_DOMAIN = {
  PROD: '.nagiyu.com',
  DEV: '.dev.nagiyu.com',
} as const;

/**
 * Cookie 名サフィックス定数（dev/prod でクッキーを分離し、環境間の混同を防ぐ）
 */
const AUTH_COOKIE_SUFFIX = {
  NONE: '',
  DEV: '.dev',
} as const;

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
  nagiyuEnv?: string;
}

export interface CreateServiceAuthConfigOptions {
  includeSubAsUserIdFallback?: boolean;
}

interface ResolvedAuthCookieEnv {
  domain: string | undefined;
  suffix: string;
  isDevelopment: boolean;
}

/**
 * dev / prod の判定を集約する。
 *
 * Next.js はビルド時（`next build`）に `process.env.NODE_ENV` をリテラル 'production' へ
 * 静的置換する（define-env.js）ため、デプロイ後のサーバーサイドでは `NODE_ENV` から
 * dev/prod を判定できない（`NEXT_PUBLIC_` プレフィックスの環境変数も同様にビルド時へ
 * インライン化される）。そのため dev/prod の判定には、ビルド時に置換されない
 * 専用の実行時環境変数 `NAGIYU_ENV`（'dev' | 'prod'）を用いる。
 * `NODE_ENV === 'development'`（`next dev` によるローカル開発）の判定のみ、
 * 引き続き `NODE_ENV` を用いる（ローカルでは `next build` を経ないため置換されない）。
 *
 * `NAGIYU_ENV` が未設定の場合は prod 扱いとする（本番環境の設定漏れで dev 扱いになり
 * SSO や Cookie ドメインが壊れることを避けるための安全側のデフォルト）。
 */
function resolveAuthCookieEnv(nodeEnv?: string, nagiyuEnv?: string): ResolvedAuthCookieEnv {
  const resolvedNodeEnv = nodeEnv ?? process.env.NODE_ENV;
  const isDevelopment = resolvedNodeEnv === 'development';

  if (isDevelopment) {
    return { domain: undefined, suffix: AUTH_COOKIE_SUFFIX.NONE, isDevelopment: true };
  }

  const resolvedNagiyuEnv = nagiyuEnv ?? process.env.NAGIYU_ENV;
  if (resolvedNagiyuEnv === 'dev') {
    return { domain: AUTH_COOKIE_DOMAIN.DEV, suffix: AUTH_COOKIE_SUFFIX.DEV, isDevelopment: false };
  }

  return { domain: AUTH_COOKIE_DOMAIN.PROD, suffix: AUTH_COOKIE_SUFFIX.NONE, isDevelopment: false };
}

export function createAuthSessionConfig(): NonNullable<NextAuthConfig['session']> {
  return {
    strategy: 'jwt',
    maxAge: AUTH_SESSION_MAX_AGE,
  };
}

export function createAuthCookieOptions(nodeEnv?: string, nagiyuEnv?: string): AuthCookieOptions {
  const { domain, isDevelopment } = resolveAuthCookieEnv(nodeEnv, nagiyuEnv);

  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    domain,
    secure: !isDevelopment,
  };
}

export function createAuthCookies(
  nodeEnv?: string,
  nagiyuEnv?: string
): NonNullable<NextAuthConfig['cookies']> {
  const { suffix: cookieSuffix } = resolveAuthCookieEnv(nodeEnv, nagiyuEnv);
  const cookieOptions = createAuthCookieOptions(nodeEnv, nagiyuEnv);

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
  const { nodeEnv, nagiyuEnv, includeSubAsUserIdFallback, jwt } = options;

  return {
    session: createAuthSessionConfig(),
    cookies: createAuthCookies(nodeEnv, nagiyuEnv),
    callbacks: createAuthCallbacks({ includeSubAsUserIdFallback, jwt }),
  };
}

export function createServiceAuthConfig(
  options: CreateServiceAuthConfigOptions = {}
): Pick<NextAuthConfig, 'session' | 'cookies' | 'callbacks' | 'pages'> {
  const { includeSubAsUserIdFallback } = options;
  const authUrl = process.env.NEXT_PUBLIC_AUTH_URL;
  const signIn = authUrl ? `${authUrl}/signin` : '/signin';

  return {
    ...createAuthConfig({ includeSubAsUserIdFallback }),
    pages: {
      signIn,
    },
  };
}
