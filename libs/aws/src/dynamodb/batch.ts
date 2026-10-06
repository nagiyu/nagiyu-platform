/**
 * DynamoDB BatchWrite / BatchGet の共通処理
 *
 * 1 回のバッチ呼び出しには件数上限があり、未処理分 (UnprocessedItems / UnprocessedKeys) が
 * 返ることもあるため、分割送信と指数バックオフ付きの再送を集約する。
 */

import {
  BatchGetCommand,
  BatchWriteCommand,
  type BatchGetCommandInput,
  type BatchWriteCommandInput,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { sleep } from '@nagiyu/common';
import type { DynamoDBItem } from './types.js';

const ERROR_MESSAGES = {
  UNPROCESSED_ITEMS_REMAINED: (maxRetries: number, remaining: number) =>
    `UnprocessedItems が最大リトライ回数（${maxRetries}）後も残存しました（残 ${remaining} 件）`,
  UNPROCESSED_KEYS_REMAINED: (maxRetries: number, remaining: number) =>
    `UnprocessedKeys が最大リトライ回数（${maxRetries}）後も残存しました（残 ${remaining} 件）`,
} as const;

/** BatchWriteItem の 1 回あたりの最大件数 */
const BATCH_WRITE_MAX = 25;

/** BatchGetItem の 1 回あたりの最大件数 */
const BATCH_GET_MAX = 100;

const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_BASE_DELAY_MS = 50;

/** BatchWriteCommand に渡す 1 件分の書き込みリクエスト */
export type BatchWriteRequest = NonNullable<BatchWriteCommandInput['RequestItems']>[string][number];

/**
 * 未処理分の再送に関するオプション。
 *
 * sleep はテストで待機を差し替えるために注入できる。
 */
export type BatchRetryOptions = {
  /** 再送回数の上限 (既定 4) */
  maxRetries?: number;
  /** 初回待機時間 (ms)。以降は 2 倍ずつ増える (既定 50) */
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

/**
 * 再送回数の上限後も未処理分が残った場合の例外。
 *
 * RepositoryError / DatabaseError は継承しない。呼び出し側が自身のメッセージ接頭辞付きで包むため、
 * ここで DatabaseError にすると文言が二重になる。
 */
export class BatchRetryExhaustedError extends Error {
  /** 未処理のまま残った件数 */
  public readonly remaining: number;

  constructor(message: string, remaining: number) {
    super(message);
    this.name = 'BatchRetryExhaustedError';
    this.remaining = remaining;
  }
}

/** 先頭から size 件ずつに分割する */
function chunked<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

/**
 * BatchWrite を 25 件ずつに分割して送り、未処理分は指数バックオフで再送する。
 *
 * 不可逆な削除などで未処理を残したまま成功扱いにしないよう、上限後も残れば例外を投げる。
 * SDK の例外は包まずそのまま伝播する (理由は queryPages と同じ)。
 *
 * @returns 処理できた件数 (再送後の最終成功数)
 */
export async function batchWriteAll(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  requests: BatchWriteRequest[],
  options: BatchRetryOptions = {}
): Promise<number> {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    sleep: sleepFn = sleep,
  } = options;
  let processedCount = 0;

  for (const chunk of chunked(requests, BATCH_WRITE_MAX)) {
    let pending = chunk;
    let retries = 0;

    while (pending.length > 0) {
      const result = await docClient.send(
        new BatchWriteCommand({ RequestItems: { [tableName]: pending } })
      );
      const unprocessed = result.UnprocessedItems?.[tableName] ?? [];
      processedCount += pending.length - unprocessed.length;

      if (unprocessed.length === 0) break;

      if (retries >= maxRetries) {
        throw new BatchRetryExhaustedError(
          ERROR_MESSAGES.UNPROCESSED_ITEMS_REMAINED(maxRetries, unprocessed.length),
          unprocessed.length
        );
      }

      await sleepFn(baseDelayMs * 2 ** retries);
      retries++;
      pending = unprocessed as BatchWriteRequest[];
    }
  }

  return processedCount;
}

/**
 * BatchGet を 100 件ずつに分割して送り、未処理キーは指数バックオフで再送して全件を連結して返す。
 *
 * キーの重複排除はしない。例外の扱いは batchWriteAll と同じ。
 */
export async function batchGetAll(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  keys: Record<string, unknown>[],
  options: BatchRetryOptions = {}
): Promise<DynamoDBItem[]> {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    sleep: sleepFn = sleep,
  } = options;
  const items: DynamoDBItem[] = [];

  for (const chunk of chunked(keys, BATCH_GET_MAX)) {
    let pending = chunk;
    let retries = 0;

    while (pending.length > 0) {
      const input: BatchGetCommandInput = { RequestItems: { [tableName]: { Keys: pending } } };
      const result = await docClient.send(new BatchGetCommand(input));
      items.push(...((result.Responses?.[tableName] ?? []) as DynamoDBItem[]));

      const unprocessed = result.UnprocessedKeys?.[tableName]?.Keys ?? [];
      if (unprocessed.length === 0) break;

      if (retries >= maxRetries) {
        throw new BatchRetryExhaustedError(
          ERROR_MESSAGES.UNPROCESSED_KEYS_REMAINED(maxRetries, unprocessed.length),
          unprocessed.length
        );
      }

      await sleepFn(baseDelayMs * 2 ** retries);
      retries++;
      pending = unprocessed;
    }
  }

  return items;
}
