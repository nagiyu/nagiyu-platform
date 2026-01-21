/**
 * セッション情報の型定義
 */
export interface Session {
  /**
   * ユーザー情報
   */
  user: {
    id: string;
    email: string;
    name: string;
    image?: string;
    roles: string[];
  };
}
