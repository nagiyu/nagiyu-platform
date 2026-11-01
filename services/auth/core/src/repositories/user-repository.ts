import type { PaginatedResult, PaginationOptions } from '@nagiyu/aws';
import type { User } from '@nagiyu/common';

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
 * ユーザーリポジトリのインターフェース。
 *
 * DynamoDB / InMemory 双方の実装が `@nagiyu/aws` の `registerDynamoRepositories`
 * 経由で切り替えられるように設計している。
 *
 * 対象のユーザーがいない更新・削除は、どちらの実装も `EntityNotFoundError` を投げる。
 */
export interface UserRepository {
  getUserByGoogleId(googleId: string): Promise<User | null>;
  getUserById(userId: string): Promise<User | null>;
  listUsers(options?: PaginationOptions): Promise<PaginatedResult<User>>;
  upsertUser(input: UpsertUserInput): Promise<User>;
  updateUser(userId: string, input: UpdateUserInput): Promise<User>;
  deleteUser(userId: string): Promise<void>;
  assignRoles(userId: string, roles: string[]): Promise<User>;
  updateLastLogin(userId: string): Promise<void>;
}
