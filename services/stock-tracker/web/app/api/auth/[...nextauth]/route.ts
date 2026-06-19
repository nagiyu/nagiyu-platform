import { handlers } from '@/auth';
import { NextRequest } from 'next/server';

async function GET(req: NextRequest) {
  if (process.env.SKIP_AUTH_CHECK === 'true' && req.nextUrl.pathname === '/api/auth/session') {
    return Response.json({
      user: {
        name: 'Test User',
        email: process.env.TEST_USER_EMAIL || 'test@example.com',
        image: null,
        roles: process.env.TEST_USER_ROLES?.split(',').map((role) => role.trim()) || ['stock-user'],
      },
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
  }
  return handlers.GET(req);
}

// サインアウト処理は Cookie 発行元の auth サービスに集約する方針のため、
// consumer である stock-tracker はローカルで signout POST を受け付けない。
// POST を export しないことで /api/auth/signout への直接 POST を無効化し、
// 内部ホスト名（ip-10-x-x-x.ec2.internal）へのリダイレクトによる
// ERR_NAME_NOT_RESOLVED を防ぐ。
// サインアウトは buildSignOutUrl() で生成した auth サービスの URL へ遷移させる。
export { GET };
