import { auth } from './auth';
import { NextResponse } from 'next/server';

/**
 * Admin サービスのミドルウェア
 *
 * Auth サービスから発行された JWT を検証し、未認証ユーザーを
 * Auth サービスのサインインページにリダイレクトする。
 */
export default auth((req) => {
  const { auth: session } = req;

  // 認証が必要なパスの場合
  if (!session) {
    const authUrl = process.env.NEXT_PUBLIC_AUTH_URL || process.env.NEXTAUTH_URL;
    if (!authUrl) {
      console.error('NEXT_PUBLIC_AUTH_URL or NEXTAUTH_URL is not set');
      return NextResponse.json({ error: 'Authentication configuration error' }, { status: 500 });
    }

    // Auth サービスのサインインページにリダイレクト
    // リダイレクト後に元のページに戻れるように callbackUrl を設定
    const signInUrl = new URL(`${authUrl}/signin`);
    signInUrl.searchParams.set('callbackUrl', req.url);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  // API routes, static files, images を除外
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
