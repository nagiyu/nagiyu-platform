import { auth } from './auth';
import { createAuthMiddleware } from '@nagiyu/nextjs/middleware';

/**
 * LiveTalk サービスのミドルウェア
 *
 * Auth サービスから発行された JWT を検証し、ログイン済みのユーザーであれば
 * 権限を問わずアクセスを許可する。未認証ユーザーは Auth サービスのサインインへ
 * リダイレクトする。`/api` は matcher で除外しており、各 API ルートが自身で認証を判定する。
 *
 * 開発・テスト環境では、SKIP_AUTH_CHECK=true を設定することで
 * 認証チェックをスキップできます。
 */
export default auth(
  createAuthMiddleware({
    getSignInBaseUrl: () => process.env.NEXT_PUBLIC_AUTH_URL || process.env.NEXTAUTH_URL,
    isPublicPath: (pathname) => pathname.startsWith('/legal/'),
  })
);

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|manifest.json|icon-192x192.png|icon-512x512.png|sw.js).*)',
  ],
};
