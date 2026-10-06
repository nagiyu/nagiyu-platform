/**
 * アカウント削除リポジトリの DynamoDB 実装（退会・データ削除 / Issue #3579）。
 *
 * ADR-2.21 の要件:
 * - `PK = USER#<userId>` 配下の全アイテムをページネーションで全件取得する。
 * - SafetyEvent 以外: BatchWriteCommand（最大 25 件/バッチ）でハード削除する。
 * - SafetyEvent: 匿名トークン（`ANON#<ulid>`）を 1 つ発行し、
 *   TransactWriteCommand で 1 件ずつ原子的に re-key（旧 PK 削除 + 新 PK への Put）する。
 *
 * @see docs/services/livetalk/architecture.md §2.21（ADR-2.21）
 */

import { TransactWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { batchWriteAll, DatabaseError, queryAllItems, type DynamoDBItem } from '@nagiyu/aws';
import { sleep } from '@nagiyu/common';
import type { AccountDeletionResult } from '../entities/account-deletion.entity.js';
import { defaultUlidFactory, type UlidFactory } from '../lib/ulid.js';
import { buildSafetyEventGSI2PK, buildSafetyEventSKPrefix, buildUserPK } from '../mappers/keys.js';
import type { AccountDeletionRepository } from './account-deletion.repository.interface.js';

/** エラーメッセージ定数 */
export const ACCOUNT_DELETION_ERROR_MESSAGES = {
  クエリ失敗: 'アカウント削除: ユーザーアイテムのクエリに失敗しました',
  バッチ削除失敗: 'アカウント削除: バッチ削除に失敗しました',
  再キー失敗: 'アカウント削除: SafetyEvent の匿名化（re-key）に失敗しました',
} as const;

/**
 * 指定ミリ秒だけ待機するヘルパー。
 * テストで差し替えやすいよう DI 可能にする。
 */
type SleepFn = (ms: number) => Promise<void>;

export class DynamoDBAccountDeletionRepository implements AccountDeletionRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly ulidFactory: UlidFactory;
  private readonly nowMs: () => number;
  private readonly sleep: SleepFn;

  constructor(
    docClient: DynamoDBDocumentClient,
    tableName: string,
    ulidFactory: UlidFactory = defaultUlidFactory,
    nowMs: () => number = () => Date.now(),
    sleepFn: SleepFn = sleep
  ) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.ulidFactory = ulidFactory;
    this.nowMs = nowMs;
    this.sleep = sleepFn;
  }

  public async deleteAccount(userId: string): Promise<AccountDeletionResult> {
    const pk = buildUserPK(userId);
    const safetyPrefix = buildSafetyEventSKPrefix();

    // 1. PK 配下の全アイテムをページネーションで取得する
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

    // 3. SafetyEvent 以外をバッチ削除する
    const deletedCount = await this.batchDelete(deleteItems);

    // 4. SafetyEvent を匿名化する（全イベントに同一トークンを付与）
    const anonymizedCount = await this.anonymizeSafetyEvents(pk, safetyItems);

    return { deletedCount, anonymizedCount };
  }

  /**
   * PK 配下の全アイテムをページネーションで取得する。
   */
  private async queryAll(pk: string): Promise<DynamoDBItem[]> {
    try {
      return await queryAllItems(this.docClient, {
        TableName: this.tableName,
        KeyConditionExpression: '#pk = :pk',
        ExpressionAttributeNames: { '#pk': 'PK' },
        ExpressionAttributeValues: { ':pk': pk },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(
        `${ACCOUNT_DELETION_ERROR_MESSAGES.クエリ失敗}: ${message}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * 対象アイテムを BatchWriteCommand で削除する。
   * 25 件ごとにバッチを分割し、UnprocessedItems は指数バックオフでリトライする。
   * 不可逆な「データ削除」では未削除を残したまま成功扱いにせず、残件があれば例外を投げて
   * 呼び出し側で 500 を返し、冪等再実行に委ねる。
   *
   * @returns 削除件数（リトライ後の最終成功数）
   */
  private async batchDelete(items: DynamoDBItem[]): Promise<number> {
    try {
      return await batchWriteAll(
        this.docClient,
        this.tableName,
        items.map((item) => ({
          DeleteRequest: { Key: { PK: String(item['PK']), SK: String(item['SK']) } },
        })),
        { sleep: this.sleep }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(
        `${ACCOUNT_DELETION_ERROR_MESSAGES.バッチ削除失敗}: ${message}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * SafetyEvent アイテムを匿名化する。
   *
   * この呼び出しで ULID を 1 つだけ発行し、同一呼び出し内の全 SafetyEvent に同じ匿名トークンを
   * 付与する（同一ユーザーの検出を可能な範囲でグルーピングするため）。トークンは不可逆なランダム値で、
   * googleId に紐づかない（ADR-2.21「個人識別子を切り離す」を優先）。部分失敗後の再実行では
   * 残件に別トークンが振られうる（グルーピングはベストエフォート）。
   *
   * 各アイテムは TransactWriteCommand で原子的に re-key する。
   * - Put: 新 PK（`USER#ANON#<ulid>`）に移動。UserID も匿名トークンに置換する。
   * - Delete: 旧 PK（`USER#<userId>`）から削除する。
   *
   * @returns 匿名化件数
   */
  private async anonymizeSafetyEvents(originalPk: string, items: DynamoDBItem[]): Promise<number> {
    if (items.length === 0) return 0;

    const now = this.nowMs();
    const anonToken = `ANON#${this.ulidFactory(now)}`;
    const newPk = buildUserPK(anonToken);
    const nowIso = new Date(now).toISOString();

    let anonymizedCount = 0;

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

      try {
        await this.docClient.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Put: {
                  TableName: this.tableName,
                  Item: newItem,
                },
              },
              {
                Delete: {
                  TableName: this.tableName,
                  Key: { PK: originalPk, SK: item['SK'] },
                },
              },
            ],
          })
        );
        anonymizedCount++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new DatabaseError(
          `${ACCOUNT_DELETION_ERROR_MESSAGES.再キー失敗}: ${message}`,
          error instanceof Error ? error : undefined
        );
      }
    }

    return anonymizedCount;
  }
}
