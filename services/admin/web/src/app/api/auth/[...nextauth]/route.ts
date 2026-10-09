import { handlers } from '@/auth';
import { createClientSessionGetHandler } from '@nagiyu/nextjs';
import type { NextRequest } from 'next/server';

/**
 * NextAuth のルートハンドラ（`/api/auth/*`）。
 *
 * クライアント側の `useSession()`（next-auth/react）は `/api/auth/session` を
 * fetch してセッションを取得する。このハンドラが無いと session が取得できず、
 * ヘッダーのアカウントメニュー（サインアウト導線）が表示されない。
 *
 * OAuth プロバイダーは Auth サービス側で管理するため、ここでは JWT 検証のみを
 * 担う（`auth.ts` の `providers: []`）。
 *
 * `SKIP_AUTH_CHECK=true`（dev / E2E）では `/api/auth/session` に対して
 * テスト用セッションを返し、サーバー側の `getSession()`（session.ts）と
 * ロールの見え方を一致させる。
 */
const GET = createClientSessionGetHandler((req: NextRequest) => handlers.GET(req), {
  defaultRoles: ['admin'],
});

// サインアウト処理は Cookie 発行元の auth サービスに集約する方針のため、
// consumer である admin はローカルで signout POST を受け付けない。
// POST を export しないことで /api/auth/signout への直接 POST を無効化し、
// 内部ホスト名へのリダイレクトによる名前解決エラーを防ぐ。
// サインアウトは buildSignOutUrl() で生成した auth サービスの URL へ遷移させる。
export { GET };
