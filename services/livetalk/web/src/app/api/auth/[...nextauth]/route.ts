import { handlers } from '@/auth';
import { NextRequest } from 'next/server';

/**
 * NextAuth のルートハンドラ（`/api/auth/*`）。
 *
 * クライアント側の `useSession()`（next-auth/react）は `/api/auth/session` を
 * fetch してセッションを取得する。このハンドラが無いと session が取得できず、
 * 権限ベースの UI 出し分け（例: ステータスページへの導線）が機能しない。
 *
 * OAuth プロバイダーは Auth サービス側で管理するため、ここでは JWT 検証のみを
 * 担う（`auth.ts` の `providers: []`）。
 *
 * `SKIP_AUTH_CHECK=true`（dev / E2E）では `/api/auth/session` に対して
 * テスト用セッションを返し、サーバー側の `getSession()`（session.ts）と
 * ロールの見え方を一致させる。
 */
async function GET(req: NextRequest) {
  if (process.env.SKIP_AUTH_CHECK === 'true' && req.nextUrl.pathname === '/api/auth/session') {
    return Response.json({
      user: {
        name: 'Test User',
        email: process.env.TEST_USER_EMAIL || 'test@example.com',
        image: null,
        roles: process.env.TEST_USER_ROLES?.split(',').map((role) => role.trim()) || [
          'livetalk-user',
        ],
      },
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
  }
  return handlers.GET(req);
}

// サインアウト処理は Cookie 発行元の auth サービスに集約する方針のため、
// consumer である livetalk はローカルで signout POST を受け付けない。
// POST を export しないことで /api/auth/signout への直接 POST を無効化し、
// 内部ホスト名（ip-10-x-x-x.ec2.internal）へのリダイレクトによる
// ERR_NAME_NOT_RESOLVED を防ぐ。
// サインアウトは buildSignOutUrl() で生成した auth サービスの URL へ遷移させる。
export { GET };
