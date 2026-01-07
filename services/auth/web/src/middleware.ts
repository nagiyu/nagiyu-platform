import { auth } from '@nagiyu/auth-core';
import type { NextAuthRequest } from 'next-auth';
import { NextResponse } from 'next/server';

export default auth((req: NextAuthRequest) => {
  const isAuthenticated = !!req.auth;
  const isAuthPage = req.nextUrl.pathname.startsWith('/signin');

  // 未認証ユーザーを保護されたページからサインインページにリダイレクト
  if (!isAuthenticated && !isAuthPage) {
    const signInUrl = new URL('/signin', req.url);
    signInUrl.searchParams.set('callbackUrl', req.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|auth).*)'],
};
