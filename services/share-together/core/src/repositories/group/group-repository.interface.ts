import type { Group, CreateGroupInput, UpdateGroupInput } from '../../types/index.js';

export interface GroupRepository {
  getById(groupId: string): Promise<Group | null>;
  /**
   * 複数のグループを ID でまとめて取得する。
   * 重複した ID は 1 回だけ引き、存在しないグループは結果に含めない。順序は保証しない。
   */
  batchGetByIds(groupIds: string[]): Promise<Group[]>;
  /** @throws EntityAlreadyExistsError 同じグループ ID が既に存在するとき */
  create(input: CreateGroupInput): Promise<Group>;
  /** @throws EntityNotFoundError グループが存在しないとき */
  update(groupId: string, updates: UpdateGroupInput): Promise<Group>;
  /** @throws EntityNotFoundError グループが存在しないとき */
  delete(groupId: string): Promise<void>;
}
