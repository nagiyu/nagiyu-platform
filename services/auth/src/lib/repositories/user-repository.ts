/**
 * ユーザーデータを表す型
 */
export type UserData = {
  userId: string;
  googleId: string;
  email: string;
  name: string;
  picture?: string;
  roles: string[];
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
};

/**
 * ユーザー作成・更新用のデータ型
 */
export type UpsertUserInput = {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
};

/**
 * ユーザーリポジトリのインターフェース
 */
export interface UserRepository {
  /**
   * Google ID でユーザーを取得
   */
  getUserByGoogleId(googleId: string): Promise<UserData | null>;

  /**
   * ユーザー ID でユーザーを取得
   */
  getUserById(userId: string): Promise<UserData | null>;

  /**
   * ユーザーを作成または更新
   */
  upsertUser(input: UpsertUserInput): Promise<UserData>;

  /**
   * 最終ログイン日時を更新
   */
  updateLastLogin(userId: string): Promise<void>;
}
