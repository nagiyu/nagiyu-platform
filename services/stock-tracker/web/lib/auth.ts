/**
 * Authentication and Authorization Utilities
 *
 * NextAuth.js セッション取得と権限チェック
 */

import { hasPermission } from '@nagiyu/common';
import type { Permission } from '@nagiyu/common';

/**
 * セッション情報の型定義
 */
export interface Session {
  user: {
    id: string;
    email: string;
    name: string;
    roles: string[];
  };
  expires: string;
}

/**
 * エラーメッセージ定数
 */
export const AUTH_ERROR_MESSAGES = {
  UNAUTHORIZED: '認証が必要です',
  FORBIDDEN: 'この操作を実行する権限がありません',
} as const;

/**
 * セッション情報を取得する
 *
 * TODO: NextAuth.js統合後に実装
 * 現在はモックセッションを返す（開発用）
 *
 * @returns セッション情報、未認証の場合は null
 */
export async function getSession(): Promise<Session | null> {
  // TODO: Phase 0.6 完了後、NextAuth.js の auth() を使用
  // テスト環境で認証をスキップする場合、モックセッションを返す
  if (process.env.SKIP_AUTH_CHECK === 'true' || process.env.NODE_ENV === 'development') {
    return {
      user: {
        id: process.env.TEST_USER_ID || 'test-user-id',
        email: process.env.TEST_USER_EMAIL || 'test@example.com',
        name: process.env.TEST_USER_NAME || 'Test User',
        roles: process.env.TEST_USER_ROLES?.split(',') || ['stock-user'],
      },
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  // TODO: NextAuth.js統合後に以下を有効化
  // const session = await auth();
  // if (!session?.user) {
  //   return null;
  // }
  // return session;

  return null;
}

/**
 * ユーザーが指定された権限を持っているかチェック
 *
 * @param session - セッション情報
 * @param permission - 必要な権限
 * @returns 権限がある場合は true
 */
export function checkPermission(session: Session, permission: Permission): boolean {
  return hasPermission(session.user.roles, permission);
}
