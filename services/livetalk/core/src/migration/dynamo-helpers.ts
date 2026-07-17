/**
 * 一回性マイグレーション専用の DynamoDB ヘルパー（throwaway コード）。
 * legacy-reader / schema-janitor で共有するページネーション Query と
 * BatchWrite 削除の共通実装を提供する。
 */
import {
  BatchWriteCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { logger } from '@nagiyu/common';
import { DatabaseError, type DynamoDBItem } from '@nagiyu/aws';

/** 一回性移行のエラーメッセージ定数（日本語） */
export const MIGRATION_ERROR_MESSAGES = {
  クエリ失敗: '一回性移行: DynamoDB の読み取りに失敗しました',
  バッチ削除失敗: '一回性移行: バッチ削除に失敗しました',
} as const;

/** `BatchWriteCommand` の最大アイテム数 */
const BATCH_WRITE_MAX = 25;

/** UnprocessedItems リトライの最大回数 */
const UNPROCESSED_MAX_RETRIES = 4;

/** UnprocessedItems リトライの初期待機時間（ms） */
const UNPROCESSED_BASE_DELAY_MS = 50;

type SleepFn = (ms: number) => Promise<void>;
const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * `PK = pk AND begins_with(SK, skPrefix)` のアイテムをページネーションで全件取得する。
 */
export async function queryItemsByPrefix(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  pk: string,
  skPrefix: string
): Promise<DynamoDBItem[]> {
  const items: DynamoDBItem[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  for (;;) {
    let result;
    try {
      result = await docClient.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
          ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
          ExpressionAttributeValues: { ':pk': pk, ':prefix': skPrefix },
          ExclusiveStartKey: exclusiveStartKey,
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(
        `${MIGRATION_ERROR_MESSAGES.クエリ失敗}: ${message}`,
        error instanceof Error ? error : undefined
      );
    }

    for (const raw of result.Items ?? []) {
      items.push(raw as unknown as DynamoDBItem);
    }

    if (!result.LastEvaluatedKey) break;
    exclusiveStartKey = result.LastEvaluatedKey;
  }

  return items;
}

/**
 * 対象アイテムを `BatchWriteCommand` で削除する（25 件ごとに分割、UnprocessedItems は
 * 指数バックオフでリトライ）。`DynamoDBAccountDeletionRepository.batchDelete` と同じ方針。
 *
 * @returns 削除件数（リトライ後の最終成功数）
 */
export async function batchDeleteItems(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  items: DynamoDBItem[],
  sleep: SleepFn = defaultSleep
): Promise<number> {
  if (items.length === 0) return 0;

  let deletedCount = 0;

  for (let i = 0; i < items.length; i += BATCH_WRITE_MAX) {
    const chunk = items.slice(i, i + BATCH_WRITE_MAX);
    let requestItems: Array<{ DeleteRequest: { Key: { PK: string; SK: string } } }> = chunk.map(
      (item) => ({
        DeleteRequest: { Key: { PK: String(item['PK']), SK: String(item['SK']) } },
      })
    );

    let retries = 0;
    while (requestItems.length > 0) {
      let result;
      try {
        result = await docClient.send(
          new BatchWriteCommand({ RequestItems: { [tableName]: requestItems } })
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new DatabaseError(
          `${MIGRATION_ERROR_MESSAGES.バッチ削除失敗}: ${message}`,
          error instanceof Error ? error : undefined
        );
      }

      const unprocessed = result.UnprocessedItems?.[tableName];
      const processedCount = requestItems.length - (unprocessed?.length ?? 0);
      deletedCount += processedCount;

      if (!unprocessed || unprocessed.length === 0) break;

      if (retries >= UNPROCESSED_MAX_RETRIES) {
        throw new DatabaseError(
          `${MIGRATION_ERROR_MESSAGES.バッチ削除失敗}: UnprocessedItems が最大リトライ回数（${UNPROCESSED_MAX_RETRIES}）後も残存しました（残 ${unprocessed.length} 件）`
        );
      }

      await sleep(UNPROCESSED_BASE_DELAY_MS * Math.pow(2, retries));
      retries++;

      requestItems = unprocessed
        .filter((r) => r.DeleteRequest !== undefined)
        .map((r) => ({
          DeleteRequest: {
            Key: {
              PK: String((r.DeleteRequest?.Key as Record<string, unknown>)?.['PK'] ?? ''),
              SK: String((r.DeleteRequest?.Key as Record<string, unknown>)?.['SK'] ?? ''),
            },
          },
        }));
    }
  }

  return deletedCount;
}

/**
 * 削除対象アイテムの SK 一覧をログに残す（本文 PII は含めず、件数と SK のみ）。
 */
export function logDeletionPlan(
  context: string,
  userId: string,
  characterId: string,
  target: string,
  items: DynamoDBItem[]
): void {
  logger.info(context, {
    userId,
    characterId,
    target,
    count: items.length,
    skList: items.map((item) => String(item['SK'])),
  });
}
