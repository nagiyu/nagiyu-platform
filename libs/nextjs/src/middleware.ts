import { NextResponse } from 'next/server';

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
}

const MIDDLEWARE_ERROR_MESSAGES = {
  AUTH_URL_NOT_SET: 'NEXT_PUBLIC_AUTH_URL or NEXTAUTH_URL is not set',
  AUTH_CONFIGURATION_ERROR: 'Authentication configuration error',
} as const;

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
