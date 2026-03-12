import { auth } from './auth';
import { createAuthMiddleware } from '@nagiyu/nextjs/middleware';

/**
 * Admin サービスのミドルウェア
 *
 * Auth サービスから発行された JWT を検証し、未認証ユーザーを
 * Auth サービスのサインインページにリダイレクトする。
 *
 * 開発・テスト環境では、SKIP_AUTH_CHECK=true を設定することで
 * 認証チェックをスキップできます。
 */
export default auth(
  createAuthMiddleware({
    getSignInBaseUrl: () => process.env.NEXT_PUBLIC_AUTH_URL || process.env.NEXTAUTH_URL,
  })
);

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
