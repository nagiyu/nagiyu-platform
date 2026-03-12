import { createAuthMiddleware } from '@nagiyu/nextjs/middleware';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// テスト環境で認証をスキップする場合は、auth を読み込まない
// (auth を読み込むと DynamoDBUserRepository が読み込まれ、Edge Runtime で node:crypto エラーが発生するため)
const skipAuthCheck = process.env.SKIP_AUTH_CHECK === 'true';
const authMiddlewareHandler = createAuthMiddleware({
  isPublicPath: (pathname) => pathname.startsWith('/signin'),
  getCallbackUrl: (request) => request.nextUrl.pathname,
});

export default async function middleware(req: NextRequest) {
  // テスト環境で認証をスキップ
  if (skipAuthCheck) {
    return NextResponse.next();
  }

  // 本番環境では NextAuth の middleware を使用
  const { auth } = await import('@nagiyu/auth-core');

  // auth() でラップされた middleware を作成
  const authMiddleware = auth(authMiddlewareHandler);

  // NextAuth middleware を実行
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (authMiddleware as any)(req);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|auth).*)'],
  // Node.js runtime を使用して node:crypto を許可
  runtime: 'nodejs',
};
