import { auth } from './auth';
import type { NextAuthRequest } from 'next-auth';
import { NextResponse } from 'next/server';

/**
 * Admin サービスのミドルウェア
 *
 * Auth サービスから発行された JWT を検証し、未認証ユーザーを
 * Auth サービスのサインインページにリダイレクトする。
 */
export default auth((req: NextAuthRequest) => {
  const isAuthenticated = !!req.auth;

  // 未認証の場合、Auth サービスのサインインページにリダイレクト
  if (!isAuthenticated) {
    const authUrl = process.env.NEXT_PUBLIC_AUTH_URL || process.env.NEXTAUTH_URL;
    if (!authUrl) {
      console.error('NEXT_PUBLIC_AUTH_URL or NEXTAUTH_URL is not set');
      return NextResponse.json({ error: 'Authentication configuration error' }, { status: 500 });
    }

    // Auth サービスのサインインページにリダイレクト
    // リダイレクト後に元のページに戻れるように callbackUrl を設定
    const signInUrl = new URL(`${authUrl}/signin`);

    // callbackUrl を構築
    // CloudFront 経由のリクエストでは req.url が内部 URL になるため、
    // 環境変数 APP_URL をベースに正しい URL を構築する
    const appUrl = process.env.APP_URL;
    const callbackUrl = appUrl
      ? `${appUrl}${req.nextUrl.pathname}${req.nextUrl.search}`
      : req.nextUrl.pathname;

    signInUrl.searchParams.set('callbackUrl', callbackUrl);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  // API routes, static files, images を除外
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
