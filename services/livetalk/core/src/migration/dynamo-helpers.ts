/**
 * 一回性マイグレーション専用の DynamoDB ヘルパー（throwaway コード）。
 * legacy-reader / schema-janitor で共有するページネーション Query と
 * BatchWrite 削除の共通実装を提供する。
 */
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { logger, sleep } from '@nagiyu/common';
import { batchWriteAll, DatabaseError, queryAllItems, type DynamoDBItem } from '@nagiyu/aws';

/** 一回性移行のエラーメッセージ定数（日本語） */
export const MIGRATION_ERROR_MESSAGES = {
  クエリ失敗: '一回性移行: DynamoDB の読み取りに失敗しました',
  バッチ削除失敗: '一回性移行: バッチ削除に失敗しました',
} as const;

type SleepFn = (ms: number) => Promise<void>;

/**
 * `PK = pk AND begins_with(SK, skPrefix)` のアイテムをページネーションで全件取得する。
 */
export async function queryItemsByPrefix(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  pk: string,
  skPrefix: string
): Promise<DynamoDBItem[]> {
  try {
    return await queryAllItems(docClient, {
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
      ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
      ExpressionAttributeValues: { ':pk': pk, ':prefix': skPrefix },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DatabaseError(
      `${MIGRATION_ERROR_MESSAGES.クエリ失敗}: ${message}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * 対象アイテムを `BatchWriteCommand` で削除する（25 件ごとに分割、UnprocessedItems は
 * 指数バックオフでリトライ）。上限後も残れば例外を投げ、未削除を成功扱いにしない。
 *
 * @returns 削除件数（リトライ後の最終成功数）
 */
export async function batchDeleteItems(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  items: DynamoDBItem[],
  sleepFn: SleepFn = sleep
): Promise<number> {
  try {
    return await batchWriteAll(
      docClient,
      tableName,
      items.map((item) => ({
        DeleteRequest: { Key: { PK: String(item['PK']), SK: String(item['SK']) } },
      })),
      { sleep: sleepFn }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DatabaseError(
      `${MIGRATION_ERROR_MESSAGES.バッチ削除失敗}: ${message}`,
      error instanceof Error ? error : undefined
    );
  }
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
