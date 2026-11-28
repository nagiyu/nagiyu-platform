/**
 * in-memory 実装の AuthUserRoleSourceReader
 *
 * テスト・ローカル開発用。auth のユーザー項目を `putItem` で入れて読む。
 */

import { InMemorySingleTableStore } from '../dynamodb/in-memory/single-table-store.js';
import { readRoleGrants, readRoles } from './mapper.js';
import type { AuthUserRoleSourceReader, AuthUserRoleSources } from './reader.js';

/**
 * in-memory 実装。DynamoDB 版と同じ解釈 (旧名・検証・権利の変換) でロールを読む。
 */
export class InMemoryAuthUserRoleSourceReader implements AuthUserRoleSourceReader {
  private readonly store: InMemorySingleTableStore;

  /**
   * @param store - ユーザー項目を持つストア
   */
  constructor(store: InMemorySingleTableStore = new InMemorySingleTableStore()) {
    this.store = store;
  }

  public async getRoleSources(userId: string): Promise<AuthUserRoleSources | null> {
    const item = this.store.getByKey({ userId });
    if (!item) {
      return null;
    }
    return {
      roles: readRoles(item),
      roleGrants: readRoleGrants(item) ?? [],
    };
  }

  /**
   * auth のユーザー項目を保存する。テスト用。
   *
   * @param item - `userId` を含む項目 (保存形式の属性名)
   */
  public putItem(item: Record<string, unknown> & { userId: string }): void {
    this.store.putByKey({ userId: item.userId }, item);
  }
}
