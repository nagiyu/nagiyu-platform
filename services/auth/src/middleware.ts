import { auth } from '@/lib/auth/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const isAuthenticated = !!req.auth;
  const isAuthPage = req.nextUrl.pathname.startsWith('/signin');
  const isAuthApiRoute = req.nextUrl.pathname.startsWith('/api/auth');
  const isHealthCheck = req.nextUrl.pathname === '/api/health';

  // Allow health check and auth API routes without authentication
  if (isHealthCheck || isAuthApiRoute) {
    return NextResponse.next();
  }

  // Redirect unauthenticated users to sign-in page
  if (!isAuthenticated && !isAuthPage) {
    const signInUrl = new URL('/signin', req.url);
    signInUrl.searchParams.set('callbackUrl', req.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Redirect authenticated users away from sign-in page
  if (isAuthenticated && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
