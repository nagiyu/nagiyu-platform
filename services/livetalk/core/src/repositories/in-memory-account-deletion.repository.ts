/**
 * アカウント削除リポジトリの InMemory 実装（退会・データ削除 / Issue #3579）。
 *
 * DynamoDB 実装と同一セマンティクスで動作する。
 * USE_IN_MEMORY_DB の E2E / ユニットテスト環境で使用する。
 *
 * ADR-2.21 の要件:
 * - `PK = USER#<userId>` 配下の全アイテムをカーソルで全件取得する。
 * - SafetyEvent 以外: `store.delete(pk, sk)` でハード削除する。
 * - SafetyEvent: 匿名トークン（`ANON#<ulid>`）を 1 つ発行し、
 *   `store.put(新item)` + `store.delete(旧pk, 旧sk)` で re-key する。
 *
 * @see docs/services/livetalk/architecture.md §2.21（ADR-2.21）
 */

import { InMemorySingleTableStore, type DynamoDBItem } from '@nagiyu/aws';
import type { AccountDeletionResult } from '../entities/account-deletion.entity.js';
import { defaultUlidFactory, type UlidFactory } from '../lib/ulid.js';
import { buildSafetyEventGSI2PK, buildSafetyEventSKPrefix, buildUserPK } from '../mappers/keys.js';
import type { AccountDeletionRepository } from './account-deletion.repository.interface.js';

export class InMemoryAccountDeletionRepository implements AccountDeletionRepository {
  private readonly store: InMemorySingleTableStore;
  private readonly ulidFactory: UlidFactory;
  private readonly nowMs: () => number;

  constructor(
    store: InMemorySingleTableStore,
    ulidFactory: UlidFactory = defaultUlidFactory,
    nowMs: () => number = () => Date.now()
  ) {
    this.store = store;
    this.ulidFactory = ulidFactory;
    this.nowMs = nowMs;
  }

  public async deleteAccount(userId: string): Promise<AccountDeletionResult> {
    const pk = buildUserPK(userId);
    const safetyPrefix = buildSafetyEventSKPrefix();

    // 1. PK 配下の全アイテムをカーソルループで全件取得する
    const allItems = await this.queryAll(pk);

    // 2. SafetyEvent と それ以外に分割する
    const safetyItems: DynamoDBItem[] = [];
    const deleteItems: DynamoDBItem[] = [];

    for (const item of allItems) {
      const sk = String(item['SK'] ?? '');
      if (sk.startsWith(safetyPrefix)) {
        safetyItems.push(item);
      } else {
        deleteItems.push(item);
      }
    }

    // 3. SafetyEvent 以外をハード削除する
    for (const item of deleteItems) {
      this.store.delete(String(item['PK']), String(item['SK']));
    }
    const deletedCount = deleteItems.length;

    // 4. SafetyEvent を匿名化する（全イベントに同一トークンを付与）
    const anonymizedCount = this.anonymizeSafetyEvents(pk, safetyItems);

    return { deletedCount, anonymizedCount };
  }

  /**
   * PK 配下の全アイテムをカーソルループで取得する。
   */
  private async queryAll(pk: string): Promise<DynamoDBItem[]> {
    const items: DynamoDBItem[] = [];
    let cursor: string | undefined;

    do {
      const result = this.store.query({ pk }, cursor ? { cursor } : undefined);
      items.push(...result.items);
      cursor = result.nextCursor;
    } while (cursor !== undefined);

    return items;
  }

  /**
   * SafetyEvent アイテムを匿名化する。
   *
   * この呼び出しで ULID を 1 つだけ発行し、同一呼び出し内の全 SafetyEvent に同じ匿名トークンを
   * 付与する（同一ユーザーの検出を可能な範囲でグルーピングするため）。トークンは不可逆なランダム値で、
   * googleId に紐づかない（ADR-2.21「個人識別子を切り離す」を優先）。部分失敗後の再実行では
   * 残件に別トークンが振られうる（グルーピングはベストエフォート）。
   *
   * 各アイテムは `store.put(新item)` + `store.delete(旧pk, 旧sk)` で re-key する。
   *
   * @returns 匿名化件数
   */
  private anonymizeSafetyEvents(originalPk: string, items: DynamoDBItem[]): number {
    if (items.length === 0) return 0;

    const now = this.nowMs();
    const anonToken = `ANON#${this.ulidFactory(now)}`;
    const newPk = buildUserPK(anonToken);
    const nowIso = new Date(now).toISOString();

    for (const item of items) {
      const newItem: DynamoDBItem = {
        ...item,
        PK: newPk,
        // UserID を匿名トークンに置換する（mapper が非空文字列でバリデートするため空にできない）
        UserID: anonToken,
        // GSI2 は維持する（匿名化後も横断 Query に残す）
        GSI2PK: buildSafetyEventGSI2PK(),
        // GSI2SK は既存値を維持し、欠落時は EventID（= 定義上の GSI2SK 値）で補完する。
        // #3580 以前の legacy item で GSI2SK が欠落していても確実に横断索引へ残す。
        GSI2SK: item['GSI2SK'] ?? (item['EventID'] as string),
        UpdatedAt: now,
        AnonymizedAt: nowIso,
      };

      // 原子的に re-key（InMemory は単スレッドなので順序保証される）
      this.store.put(newItem);
      this.store.delete(originalPk, String(item['SK']));
    }

    return items.length;
  }
}
