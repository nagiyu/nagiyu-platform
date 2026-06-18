import { NextResponse } from 'next/server';
import { auth } from './auth';
import { createAuthMiddleware } from '@nagiyu/nextjs/middleware';

/**
 * LiveTalk サービスのミドルウェア
 *
 * Auth サービスから発行された JWT を検証し、`livetalk:chat` permission を持つ
 * ユーザーのみアクセスを許可する。未認証ユーザーは Auth サービスのサインインへ
 * リダイレクトし、認証済みでも permission がない場合は /forbidden へリダイレクトする。
 *
 * 開発・テスト環境では、SKIP_AUTH_CHECK=true を設定することで
 * 認証チェックをスキップできます。
 */
export default auth(
  createAuthMiddleware({
    getSignInBaseUrl: () => process.env.NEXT_PUBLIC_AUTH_URL || process.env.NEXTAUTH_URL,
    requiredPermission: 'livetalk:chat',
    isPublicPath: (pathname) => pathname.startsWith('/legal/') || pathname === '/forbidden',
    onForbidden: (request) => {
      // 元のパスを from クエリパラメータとして /forbidden へリダイレクトする
      // APP_URL が未設定の場合は request.url からオリジンを取得する
      const appUrl = process.env.APP_URL ?? new URL(request.url).origin;
      const forbiddenUrl = new URL('/forbidden', appUrl);
      // searchParams.set は値を自動でパーセントエンコードするため、
      // encodeURIComponent は不要（二重エンコードになる）
      forbiddenUrl.searchParams.set('from', request.nextUrl.pathname + request.nextUrl.search);
      return NextResponse.redirect(forbiddenUrl);
    },
  })
);

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|manifest.json|icon-192x192.png|icon-512x512.png|sw.js).*)',
  ],
};
