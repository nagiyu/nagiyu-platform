import { auth } from '../auth';
import type { NextAuthRequest } from 'next-auth';
import { NextResponse } from 'next/server';
import { ERROR_MESSAGES } from './lib/constants/errors';

const LOG_MESSAGES = {
  AUTH_URL_NOT_SET: 'NEXT_PUBLIC_AUTH_URL または NEXTAUTH_URL が設定されていません',
} as const;

export default auth((req: NextAuthRequest) => {
  const skipAuthCheck = process.env.SKIP_AUTH_CHECK === 'true';
  if (skipAuthCheck) {
    return NextResponse.next();
  }

  const isAuthenticated = !!req.auth;

  if (!isAuthenticated) {
    const authUrl = process.env.NEXT_PUBLIC_AUTH_URL || process.env.NEXTAUTH_URL;
    if (!authUrl) {
      console.error(LOG_MESSAGES.AUTH_URL_NOT_SET);
      return NextResponse.json(
        { error: { code: 'INTERNAL_SERVER_ERROR', message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR } },
        { status: 500 }
      );
    }

    const appUrl = process.env.APP_URL;
    const callbackUrl = appUrl
      ? `${appUrl}${req.nextUrl.pathname}${req.nextUrl.search}`
      : req.nextUrl.href;

    const signInUrl = new URL(`${authUrl}/signin`);
    signInUrl.searchParams.set('callbackUrl', callbackUrl);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|manifest.json|icon-192x192.png|icon-512x512.png|sw.js).*)',
  ],
};
