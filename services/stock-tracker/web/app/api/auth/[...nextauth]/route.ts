import { handlers } from '@/auth';
import { createClientSessionGetHandler } from '@nagiyu/nextjs/session';
import type { NextRequest } from 'next/server';

/**
 * `SKIP_AUTH_CHECK=true`（dev / E2E）では `/api/auth/session` にテスト用セッションを返し、
 * サーバー側の `getSession()` とロールの見え方（ヘッダ `x-test-user-roles` を含む）を一致させる。
 */
const GET = createClientSessionGetHandler((req: NextRequest) => handlers.GET(req), {
  defaultRoles: ['stock-user'],
});

// サインアウト処理は Cookie 発行元の auth サービスに集約する方針のため、
// consumer である stock-tracker はローカルで signout POST を受け付けない。
// POST を export しないことで /api/auth/signout への直接 POST を無効化し、
// 内部ホスト名（ip-10-x-x-x.ec2.internal）へのリダイレクトによる
// ERR_NAME_NOT_RESOLVED を防ぐ。
// サインアウトは buildSignOutUrl() で生成した auth サービスの URL へ遷移させる。
export { GET };
