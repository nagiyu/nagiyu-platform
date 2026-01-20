import type { UserRepository, UserData, UpsertUserInput } from './user-repository.js';

/**
 * メモリ内でユーザーデータを管理するモック実装
 * 開発・テスト環境で使用
 */
export class InMemoryUserRepository implements UserRepository {
  private users: Map<string, UserData> = new Map();
  private googleIdIndex: Map<string, string> = new Map();

  async getUserByGoogleId(googleId: string): Promise<UserData | null> {
    const userId = this.googleIdIndex.get(googleId);
    if (!userId) {
      return null;
    }
    return this.users.get(userId) || null;
  }

  async getUserById(userId: string): Promise<UserData | null> {
    return this.users.get(userId) || null;
  }

  async upsertUser(input: UpsertUserInput): Promise<UserData> {
    const existingUserId = this.googleIdIndex.get(input.googleId);
    const now = new Date().toISOString();

    if (existingUserId) {
      const existingUser = this.users.get(existingUserId);
      if (existingUser) {
        const updatedUser: UserData = {
          ...existingUser,
          email: input.email,
          name: input.name,
          picture: input.picture,
          updatedAt: now,
        };
        this.users.set(existingUserId, updatedUser);
        return updatedUser;
      }
    }

    const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const newUser: UserData = {
      userId,
      googleId: input.googleId,
      email: input.email,
      name: input.name,
      picture: input.picture,
      roles: [],
      createdAt: now,
      updatedAt: now,
    };

    this.users.set(userId, newUser);
    this.googleIdIndex.set(input.googleId, userId);

    return newUser;
  }

  async updateLastLogin(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      user.lastLoginAt = new Date().toISOString();
      this.users.set(userId, user);
    }
  }
}
