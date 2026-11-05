import { handlers } from '@/auth';
import { createClientSessionGetHandler } from '@nagiyu/nextjs';
import type { NextRequest } from 'next/server';

/**
 * NextAuth のルートハンドラ（`/api/auth/*`）。
 *
 * ヘッダーの `useSession()` は `/api/auth/session` を fetch してセッションを取得する。
 * ログインは任意なので、セッションが無い場合もこのハンドラは空のセッションを返すだけで、
 * 他のページや API の動作には影響しない。
 */
const GET = createClientSessionGetHandler((req: NextRequest) => handlers.GET(req), {
  defaultRoles: [],
});

// サインアウトは Cookie 発行元の auth サービスに集約しているため、POST は公開しない。
// ローカルで受けると内部ホスト名へのリダイレクトで名前解決に失敗する。
export { GET };
