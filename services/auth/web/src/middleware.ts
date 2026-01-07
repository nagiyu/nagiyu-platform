import { auth } from '@nagiyu/auth-core';
import type { NextAuthRequest } from 'next-auth';
import { NextResponse } from 'next/server';

export default auth((req: NextAuthRequest) => {
  const isAuthenticated = !!req.auth;
  const isAuthPage = req.nextUrl.pathname.startsWith('/signin');

  if (!isAuthenticated && !isAuthPage) {
    const signInUrl = new URL('/signin', req.url);
    signInUrl.searchParams.set('callbackUrl', req.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  if (isAuthenticated && isAuthPage) {
    // callbackUrl が指定されている場合はそちらにリダイレクト
    const callbackUrl = req.nextUrl.searchParams.get('callbackUrl');
    const redirectUrl = callbackUrl || '/dashboard';
    return NextResponse.redirect(new URL(redirectUrl, req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|auth).*)'],
};
