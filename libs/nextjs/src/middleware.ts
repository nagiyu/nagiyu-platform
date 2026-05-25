import { NextResponse } from 'next/server';
import { ERROR_CODES, hasPermission } from '@nagiyu/common';
import type { Permission } from '@nagiyu/common';

export interface AuthMiddlewareRequest {
  auth?: unknown;
  url: string;
  nextUrl: {
    pathname: string;
    search: string;
    href: string;
  };
}

export interface CreateAuthMiddlewareOptions {
  publicPaths?: string[];
  isPublicPath?: (pathname: string) => boolean;
  getSignInBaseUrl?: () => string | undefined;
  signInPath?: string;
  getCallbackUrl?: (request: AuthMiddlewareRequest) => string;
  onAuthConfigError?: () => NextResponse;
  /**
   * 認証済みユーザーに対して追加で要求する権限。
   * 指定された場合、`request.auth.user.roles` に当該 permission を含む role が
   * 1 つでもあれば通過、なければ 403 を返す（または `onForbidden` の戻り値）。
   */
  requiredPermission?: Permission;
  /**
   * `requiredPermission` を満たさなかった場合に返すレスポンス。
   * 未指定時は `{ error: 'FORBIDDEN', message: 'この操作を実行する権限がありません' }` を 403 で返す。
   */
  onForbidden?: (request: AuthMiddlewareRequest) => NextResponse;
}

const MIDDLEWARE_ERROR_MESSAGES = {
  AUTH_URL_NOT_SET: 'NEXT_PUBLIC_AUTH_URL or NEXTAUTH_URL is not set',
  AUTH_CONFIGURATION_ERROR: 'Authentication configuration error',
  FORBIDDEN: 'この操作を実行する権限がありません',
} as const;

interface SessionWithRoles {
  user?: {
    roles?: unknown;
  };
}

function extractRoles(auth: unknown): string[] {
  const session = auth as SessionWithRoles | null | undefined;
  const roles = session?.user?.roles;
  return Array.isArray(roles)
    ? roles.filter((role): role is string => typeof role === 'string')
    : [];
}

function getDefaultCallbackUrl(request: AuthMiddlewareRequest): string {
  const appUrl = process.env.APP_URL;
  if (appUrl) {
    return `${appUrl}${request.nextUrl.pathname}${request.nextUrl.search}`;
  }

  return request.nextUrl.pathname;
}

export function createAuthMiddleware(options: CreateAuthMiddlewareOptions = {}) {
  const {
    publicPaths = [],
    isPublicPath,
    getSignInBaseUrl,
    signInPath = '/signin',
    getCallbackUrl = getDefaultCallbackUrl,
    onAuthConfigError,
    requiredPermission,
    onForbidden,
  } = options;

  const publicPathSet = new Set(publicPaths);

  return (request: AuthMiddlewareRequest): NextResponse => {
    if (process.env.SKIP_AUTH_CHECK === 'true') {
      return NextResponse.next();
    }

    const pathname = request.nextUrl.pathname;
    if (publicPathSet.has(pathname) || isPublicPath?.(pathname)) {
      return NextResponse.next();
    }

    if (request.auth) {
      if (requiredPermission) {
        const roles = extractRoles(request.auth);
        if (!hasPermission(roles, requiredPermission)) {
          return (
            onForbidden?.(request) ??
            NextResponse.json(
              {
                error: ERROR_CODES.FORBIDDEN,
                message: MIDDLEWARE_ERROR_MESSAGES.FORBIDDEN,
              },
              { status: 403 }
            )
          );
        }
      }
      return NextResponse.next();
    }

    const signInBaseUrl = getSignInBaseUrl?.();
    if (getSignInBaseUrl && !signInBaseUrl) {
      console.error(MIDDLEWARE_ERROR_MESSAGES.AUTH_URL_NOT_SET);
      return (
        onAuthConfigError?.() ??
        NextResponse.json(
          { error: MIDDLEWARE_ERROR_MESSAGES.AUTH_CONFIGURATION_ERROR },
          { status: 500 }
        )
      );
    }

    const signInUrl = signInBaseUrl
      ? new URL(signInPath, signInBaseUrl)
      : new URL(signInPath, request.url);
    signInUrl.searchParams.set('callbackUrl', getCallbackUrl(request));
    return NextResponse.redirect(signInUrl);
  };
}
