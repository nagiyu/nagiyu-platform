import type { User } from './user';

/**
 * セッション情報の型定義
 */
export interface Session {
  /**
   * ユーザー情報
   */
  user: User;
}
