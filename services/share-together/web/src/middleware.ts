import { auth } from '../auth';
import { createAuthMiddleware } from '@nagiyu/nextjs/middleware';
import { NextResponse } from 'next/server';
import { ERROR_MESSAGES } from './lib/constants/errors';

const LOG_MESSAGES = {
  AUTH_URL_NOT_SET: 'NEXT_PUBLIC_AUTH_URL または NEXTAUTH_URL が設定されていません',
} as const;

export default auth(
  createAuthMiddleware({
    getSignInBaseUrl: () => process.env.NEXT_PUBLIC_AUTH_URL || process.env.NEXTAUTH_URL,
    getCallbackUrl: (request) => {
      const appUrl = process.env.APP_URL;
      return appUrl
        ? `${appUrl}${request.nextUrl.pathname}${request.nextUrl.search}`
        : request.nextUrl.href;
    },
    onAuthConfigError: () => {
      console.error(LOG_MESSAGES.AUTH_URL_NOT_SET);
      return NextResponse.json(
        {
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
          },
        },
        { status: 500 }
      );
    },
  })
);

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|manifest.json|icon-192x192.png|icon-512x512.png|sw.js).*)',
  ],
};
