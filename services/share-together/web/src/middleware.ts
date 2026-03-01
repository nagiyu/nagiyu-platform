import { auth } from '../auth';
import type { NextAuthRequest } from 'next-auth';
import { NextResponse } from 'next/server';

export default auth((req: NextAuthRequest) => {
  const skipAuthCheck = process.env.SKIP_AUTH_CHECK === 'true';
  if (skipAuthCheck) {
    return NextResponse.next();
  }

  const isAuthenticated = !!req.auth;

  if (!isAuthenticated) {
    const authUrl = process.env.NEXT_PUBLIC_AUTH_URL || process.env.NEXTAUTH_URL;
    if (!authUrl) {
      console.error('NEXT_PUBLIC_AUTH_URL or NEXTAUTH_URL is not set');
      return NextResponse.json({ error: 'Authentication configuration error' }, { status: 500 });
    }

    const appUrl = process.env.APP_URL;
    const callbackUrl = appUrl
      ? `${appUrl}${req.nextUrl.pathname}${req.nextUrl.search}`
      : req.nextUrl.pathname;

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
