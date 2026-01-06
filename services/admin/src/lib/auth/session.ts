import type { Session } from '../../types/auth';

/**
 * セッション情報を取得する
 *
 * Phase 1: JWT 検証は次のタスクで実装されるため、現時点ではモックデータを返す
 *
 * @returns セッション情報、または未認証の場合は null
 */
export async function getSession(): Promise<Session | null> {
  // Phase 1: モックデータを返す
  // Phase 2 以降: JWT クッキーを検証し、実際のユーザー情報を返す
  return {
    user: {
      email: 'admin@example.com',
      roles: ['admin', 'user-manager'],
    },
  };
}
