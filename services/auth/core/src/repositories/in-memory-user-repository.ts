import type { User } from '@nagiyu/common';
import {
  UserNotFoundError,
  type ListUsersResult,
  type UpdateUserInput,
  type UpsertUserInput,
  type UserRepository,
} from './user-repository';

/**
 * メモリ内でユーザーデータを管理するモック実装。
 * 開発・テスト環境で使用する。
 */
export class InMemoryUserRepository implements UserRepository {
  private users: Map<string, User> = new Map();
  private googleIdIndex: Map<string, string> = new Map();

  public async getUserByGoogleId(googleId: string): Promise<User | null> {
    const userId = this.googleIdIndex.get(googleId);
    if (!userId) {
      return null;
    }
    return this.users.get(userId) || null;
  }

  public async getUserById(userId: string): Promise<User | null> {
    return this.users.get(userId) || null;
  }

  public async listUsers(
    limit: number = 100,
    lastEvaluatedKey?: Record<string, unknown>
  ): Promise<ListUsersResult> {
    const all = Array.from(this.users.values());
    const startIndex =
      lastEvaluatedKey?.userId !== undefined
        ? all.findIndex((u) => u.userId === lastEvaluatedKey.userId) + 1
        : 0;
    const slice = all.slice(startIndex, startIndex + limit);
    const nextKey =
      startIndex + slice.length < all.length && slice.length > 0
        ? { userId: slice[slice.length - 1].userId }
        : undefined;
    return {
      users: slice,
      lastEvaluatedKey: nextKey,
    };
  }

  public async upsertUser(input: UpsertUserInput): Promise<User> {
    const existingUserId = this.googleIdIndex.get(input.googleId);
    const now = new Date().toISOString();

    if (existingUserId) {
      const existingUser = this.users.get(existingUserId);
      if (existingUser) {
        const updatedUser: User = {
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
    const newUser: User = {
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

  public async updateUser(userId: string, input: UpdateUserInput): Promise<User> {
    const existing = this.users.get(userId);
    if (!existing) {
      throw new UserNotFoundError(userId);
    }
    const updated: User = {
      ...existing,
      ...input,
      updatedAt: new Date().toISOString(),
    };
    this.users.set(userId, updated);
    return updated;
  }

  public async deleteUser(userId: string): Promise<void> {
    const existing = this.users.get(userId);
    if (!existing) {
      return;
    }
    this.users.delete(userId);
    this.googleIdIndex.delete(existing.googleId);
  }

  public async assignRoles(userId: string, roles: string[]): Promise<User> {
    return this.updateUser(userId, { roles });
  }

  public async updateLastLogin(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      const updated: User = { ...user, lastLoginAt: new Date().toISOString() };
      this.users.set(userId, updated);
    }
  }
}
