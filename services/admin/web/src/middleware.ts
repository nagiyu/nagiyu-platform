import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyJWT } from '@/lib/auth/jwt';

const AUTH_SERVICE_URL = process.env.NEXT_PUBLIC_AUTH_URL || 'https://auth.nagiyu.com';

export async function middleware(request: NextRequest) {
  // JWT クッキーを取得
  const token = request.cookies.get('__Secure-next-auth.session-token')?.value;

  if (!token) {
    // トークンがない場合は Auth サービスへリダイレクト
    const signInUrl = new URL(`${AUTH_SERVICE_URL}/signin`);
    signInUrl.searchParams.set('callbackUrl', request.url);
    return NextResponse.redirect(signInUrl);
  }

  // JWT を検証
  const payload = await verifyJWT(token);

  if (!payload) {
    // 検証失敗の場合も Auth サービスへリダイレクト
    const signInUrl = new URL(`${AUTH_SERVICE_URL}/signin`);
    signInUrl.searchParams.set('callbackUrl', request.url);
    return NextResponse.redirect(signInUrl);
  }

  // 検証成功: ユーザー情報をヘッダーに追加
  const response = NextResponse.next();
  response.headers.set('x-user-id', payload.userId);
  response.headers.set('x-user-email', payload.email);
  response.headers.set('x-user-roles', JSON.stringify(payload.roles));

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
