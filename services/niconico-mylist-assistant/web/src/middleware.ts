import { auth } from './auth';
import { createAuthMiddleware } from '@nagiyu/nextjs/middleware';

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
export default auth(
  createAuthMiddleware({
    publicPaths: ['/'],
    getSignInBaseUrl: () => process.env.NEXT_PUBLIC_AUTH_URL || process.env.NEXTAUTH_URL,
  })
);

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|manifest.json|icon-192x192.png|icon-512x512.png|sw.js).*)',
  ],
};
