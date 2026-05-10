import type { User } from '@nagiyu/common';
import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';

export class UserNotFoundError extends Error {
  constructor(userId: string) {
    super(`${COMMON_ERROR_MESSAGES.USER_NOT_FOUND}: ${userId}`);
    this.name = 'UserNotFoundError';
  }
}

/**
 * ユーザーを upsert する際の入力。
 */
export type UpsertUserInput = {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
};

/**
 * `upsertUser` 互換のため `UpsertUserInput` の別名として提供する。
 */
export type CreateUserInput = UpsertUserInput;

/**
 * ユーザー情報の部分更新用入力。
 */
export type UpdateUserInput = {
  name?: string;
  picture?: string;
  roles?: string[];
};

/**
 * `listUsers` の結果。
 */
export type ListUsersResult = {
  users: User[];
  /** 次ページ取得用のキー（最終ページなら undefined） */
  lastEvaluatedKey?: Record<string, unknown>;
};

/**
 * ユーザーリポジトリのインターフェース。
 *
 * DynamoDB / InMemory 双方の実装が `@nagiyu/aws` の `registerDynamoRepositories`
 * 経由で切り替えられるように設計している。
 */
export interface UserRepository {
  getUserByGoogleId(googleId: string): Promise<User | null>;
  getUserById(userId: string): Promise<User | null>;
  listUsers(limit?: number, lastEvaluatedKey?: Record<string, unknown>): Promise<ListUsersResult>;
  upsertUser(input: UpsertUserInput): Promise<User>;
  updateUser(userId: string, input: UpdateUserInput): Promise<User>;
  deleteUser(userId: string): Promise<void>;
  assignRoles(userId: string, roles: string[]): Promise<User>;
  updateLastLogin(userId: string): Promise<void>;
}
