import { auth } from './auth';
import type { NextAuthRequest } from 'next-auth';
import { NextResponse } from 'next/server';

/**
 * niconico-mylist-assistant サービスのミドルウェア
 *
 * Auth サービスから発行された JWT を検証し、未認証ユーザーを
 * Auth サービスのサインインページにリダイレクトする。
 *
 * ホームページ (/) は認証不要でアクセス可能。
 * 開発・テスト環境では、SKIP_AUTH_CHECK=true を設定することで
 * 認証チェックをスキップできます。
 */
export default auth((req: NextAuthRequest) => {
  // 開発・テスト環境で認証をスキップ
  const skipAuthCheck = process.env.SKIP_AUTH_CHECK === 'true';
  if (skipAuthCheck) {
    return NextResponse.next();
  }

  // ホームページは認証不要
  if (req.nextUrl.pathname === '/') {
    return NextResponse.next();
  }

  const isAuthenticated = !!req.auth;

  if (!isAuthenticated) {
    const authUrl = process.env.NEXT_PUBLIC_AUTH_URL || process.env.NEXTAUTH_URL;
    if (!authUrl) {
      console.error('NEXT_PUBLIC_AUTH_URL or NEXTAUTH_URL is not set');
      return NextResponse.json({ error: 'Authentication configuration error' }, { status: 500 });
    }

    // CloudFront 経由では内部 URL になるため、APP_URL から正しい URL を構築
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
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
