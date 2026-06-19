import { auth } from './auth';
import { createAuthMiddleware } from '@nagiyu/nextjs/middleware';

/**
 * stock-tracker サービスのミドルウェア
 *
 * Auth サービスから発行された JWT を検証し、未認証ユーザーを
 * Auth サービスのサインインページにリダイレクトする。
 *
 * stock-tracker は全ページがユーザー個別データの認証必須アプリのため、
 * publicPaths は指定しない（全ページ認証必須）。
 *
 * 未認証時は callbackUrl 付きで auth signin へリダイレクトされ、
 * 再ログイン後に元の stock-tracker 画面へ戻れる。
 *
 * 開発・テスト環境では、SKIP_AUTH_CHECK=true を設定することで
 * 認証チェックをスキップできる。
 */
export default auth(
  createAuthMiddleware({
    getSignInBaseUrl: () => process.env.NEXT_PUBLIC_AUTH_URL || process.env.NEXTAUTH_URL,
  })
);

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|manifest.json|icon-192x192.png|icon-512x512.png|sw.js).*)',
  ],
};
