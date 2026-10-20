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
   * 1 つでもあれば通過、なければ権限なしとして扱う（既定の挙動は `onForbidden` / `forbiddenPath` を参照）。
   */
  requiredPermission?: Permission;
  /**
   * `requiredPermission` を満たさなかった場合に返すレスポンス。
   * 指定した場合は `forbiddenPath` よりも優先する。
   * 未指定時の既定は次のとおり。
   * - `/api` 配下: `{ error: 'FORBIDDEN', message: 'この操作を実行する権限がありません' }` を 403 で返す
   * - それ以外（ページ）: `forbiddenPath` へ rewrite する（ブラウザ上の URL は変わらない）
   */
  onForbidden?: (request: AuthMiddlewareRequest) => NextResponse;
  /**
   * ページへの権限なしアクセスを rewrite する先のパス。既定は `/forbidden`。
   * rewrite のため URL は元のまま保たれ、リロードや戻り先の URL がそのまま使える。
   */
  forbiddenPath?: string;
}

const MIDDLEWARE_ERROR_MESSAGES = {
  AUTH_URL_NOT_SET: 'NEXT_PUBLIC_AUTH_URL or NEXTAUTH_URL is not set',
  AUTH_CONFIGURATION_ERROR: 'Authentication configuration error',
  FORBIDDEN: 'この操作を実行する権限がありません',
} as const;

const DEFAULT_FORBIDDEN_PATH = '/forbidden';
const API_PATH_PREFIX = '/api';

/**
 * API ルート（`/api` または `/api/` 配下）かどうかを判定する。
 * `/apixyz` のような接頭辞だけが一致するページを API と誤判定しないよう、区切りまで見る。
 */
function isApiPath(pathname: string): boolean {
  return pathname === API_PATH_PREFIX || pathname.startsWith(`${API_PATH_PREFIX}/`);
}

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
    forbiddenPath = DEFAULT_FORBIDDEN_PATH,
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
          if (onForbidden) {
            return onForbidden(request);
          }
          // API は呼び出し側がステータスで分岐するため JSON 403 を返し、
          // ページは URL を変えずに権限なし画面を見せるため rewrite する。
          if (isApiPath(pathname)) {
            return NextResponse.json(
              {
                error: ERROR_CODES.FORBIDDEN,
                message: MIDDLEWARE_ERROR_MESSAGES.FORBIDDEN,
              },
              { status: 403 }
            );
          }
          return NextResponse.rewrite(new URL(forbiddenPath, request.url));
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
