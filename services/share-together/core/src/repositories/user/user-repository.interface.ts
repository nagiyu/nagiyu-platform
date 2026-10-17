import type { User, CreateUserInput, UpdateUserInput } from '../../types/index.js';

export interface UserRepository {
  getById(userId: string): Promise<User | null>;
  getByEmail(email: string): Promise<User | null>;
  /**
   * 複数のユーザーを ID でまとめて取得する。
   * 重複した ID は 1 回だけ引き、存在しないユーザーは結果に含めない。順序は保証しない。
   */
  batchGetByIds(userIds: string[]): Promise<User[]>;
  /** @throws EntityAlreadyExistsError 同じユーザー ID が既に存在するとき */
  create(input: CreateUserInput): Promise<User>;
  /** @throws EntityNotFoundError ユーザーが存在しないとき */
  update(userId: string, updates: UpdateUserInput): Promise<User>;
  /** @throws EntityNotFoundError ユーザーが存在しないとき */
  delete(userId: string): Promise<void>;
}
