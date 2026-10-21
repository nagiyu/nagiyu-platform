import { auth } from './auth';
import { createAuthMiddleware } from '@nagiyu/nextjs/middleware';

/**
 * LiveTalk サービスのミドルウェア
 *
 * Auth サービスから発行された JWT を検証し、`livetalk:chat` permission を持つ
 * ユーザーのみアクセスを許可する。未認証ユーザーは Auth サービスのサインインへ
 * リダイレクトする。認証済みでも permission がない場合、ページは元のパスを from に付けて
 * /forbidden へリダイレクトする (createAuthMiddleware の既定)。`/api` は matcher で除外しており、
 * 各 API ルートが自身で権限を判定する。
 *
 * 開発・テスト環境では、SKIP_AUTH_CHECK=true を設定することで
 * 認証チェックをスキップできます。
 */
export default auth(
  createAuthMiddleware({
    getSignInBaseUrl: () => process.env.NEXT_PUBLIC_AUTH_URL || process.env.NEXTAUTH_URL,
    requiredPermission: 'livetalk:chat',
    // /forbidden は権限なしページのリダイレクト先。権限判定の対象にするとリダイレクトがループする。
    isPublicPath: (pathname) => pathname.startsWith('/legal/') || pathname === '/forbidden',
  })
);

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|manifest.json|icon-192x192.png|icon-512x512.png|sw.js).*)',
  ],
};
