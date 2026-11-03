import type { PaginatedResult, PaginationOptions } from '@nagiyu/aws';
import type { RoleGrant, User } from '@nagiyu/common';

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
 * 手動ロールと課金の権利の書き換え内容。
 *
 * 省略した項目は変更しない。
 */
export type RolesAndGrantsChange = {
  roles?: string[];
  roleGrants?: RoleGrant[];
};

/**
 * 読み直しを含む書き込みの最大試行回数 (初回を含む)。
 */
export const ROLES_AND_GRANTS_MAX_ATTEMPTS = 3;

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
  /**
   * 手動ロールと課金の権利を、1 回の書き込みでまとめて書き換える。
   *
   * 現在のユーザーを `compute` に渡し、返された内容を、読んだときの `updatedAt` を条件にして書く。
   * 同時に別の書き込みがあって `OptimisticLockError` になったときは、読み直して `compute` からやり直す
   * (最大 {@link ROLES_AND_GRANTS_MAX_ATTEMPTS} 回)。そのため `compute` は副作用を持たない関数にする。
   * 権利の出どころ (`source`) は問わない。
   *
   * `compute` が投げた例外はそのまま呼び出し元に伝える。
   *
   * @throws EntityNotFoundError 対象のユーザーがいないとき
   * @throws OptimisticLockError 試行回数を使い切っても競合が解けなかったとき
   */
  updateRolesAndGrants(
    userId: string,
    compute: (user: User) => RolesAndGrantsChange
  ): Promise<User>;
  /**
   * 呼び出し側が先に読んだ `updatedAt` を条件にして 1 回だけ書く。読み直しはしない。
   *
   * 条件が合わないときは、旧形式の `UpdatedAt` でも次の読み直しで合うよう、
   * `UpdatedAt` だけを今の形に書き直してから `OptimisticLockError` を投げる。
   *
   * @throws EntityNotFoundError 対象のユーザーがいないとき
   * @throws OptimisticLockError `expectedUpdatedAt` の後に別の書き込みがあったとき
   */
  updateRolesAndGrantsIfUnchanged(
    userId: string,
    change: RolesAndGrantsChange,
    expectedUpdatedAt: number
  ): Promise<User>;
  updateLastLogin(userId: string): Promise<void>;
}
