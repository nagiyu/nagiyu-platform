/**
 * ChatGuardRepository の DynamoDB 実装（Issue #3528）。
 *
 * Single Table 設計のメインテーブルに相乗りする。PK は既存の `USER#<userId>` を使用する。
 *
 * アイテム種別:
 * - レートリミット: SK = `RATELIMIT#<window>#<bucket>`
 * - ロック:        SK = `CHATLOCK`
 *
 * DynamoDB TTL の物理削除は最大 48h 遅延しうるため、ロック失効判定は TTL に依存せず
 * `ExpiresAt < :now` の条件付き UpdateItem で上書き取得できる設計にしている。
 */

import {
  DeleteCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DatabaseError } from '@nagiyu/aws';
import { buildUserPK } from '../mappers/keys.js';
import type {
  AcquireLockResult,
  ChatGuardRepository,
  RateLimitResult,
  RateLimitWindow,
} from './chat-guard.repository.interface.js';

/**
 * ウィンドウのバケット文字列を算出する。
 * - '1m': エポック分（floor(nowMs / 60000)）
 * - '1h': エポック時（floor(nowMs / 3600000)）
 */
export function computeBucket(window: RateLimitWindow, nowMs: number): string {
  if (window === '1m') return String(Math.floor(nowMs / 60_000));
  return String(Math.floor(nowMs / 3_600_000));
}

/**
 * ウィンドウ満了 Unix 秒（アイテムの TTL 用）を算出する。
 * バッファを加算してウィンドウ直後に即座に消えないようにする。
 * - '1m': 次の分の開始 Unix 秒 + 120s バッファ
 * - '1h': 次の時間の開始 Unix 秒 + 7200s バッファ
 */
export function computeWindowTtlSec(window: RateLimitWindow, nowMs: number): number {
  if (window === '1m') {
    return (Math.floor(nowMs / 60_000) + 1) * 60 + 120;
  }
  return (Math.floor(nowMs / 3_600_000) + 1) * 3_600 + 7_200;
}

/**
 * レートリミットアイテムの SK を組み立てる。
 */
function buildRateLimitSK(window: RateLimitWindow, bucket: string): string {
  return `RATELIMIT#${window}#${bucket}`;
}

/**
 * ロックアイテムの SK。固定値。
 */
const CHATLOCK_SK = 'CHATLOCK';

export class DynamoDBChatGuardRepository implements ChatGuardRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly nowMs: () => number;

  constructor(
    docClient: DynamoDBDocumentClient,
    tableName: string,
    nowMs: () => number = () => Date.now()
  ) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.nowMs = nowMs;
  }

  public async incrementRateLimit(
    userId: string,
    window: RateLimitWindow,
    nowMs: number
  ): Promise<RateLimitResult> {
    const pk = buildUserPK(userId);
    const bucket = computeBucket(window, nowMs);
    const sk = buildRateLimitSK(window, bucket);
    const ttlSec = computeWindowTtlSec(window, nowMs);

    try {
      const result = await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
          // Count をアトミックにインクリメントし、TTL は初回のみ設定する。
          // TTL を毎回上書きしないことでウィンドウ内の自然な満了を担保する。
          UpdateExpression: 'ADD #cnt :one SET #ttl = if_not_exists(#ttl, :ttl)',
          ExpressionAttributeNames: {
            '#cnt': 'Count',
            '#ttl': 'TTL',
          },
          ExpressionAttributeValues: {
            ':one': 1,
            ':ttl': ttlSec,
          },
          ReturnValues: 'UPDATED_NEW',
        })
      );
      const count = (result.Attributes?.['Count'] as number | undefined) ?? 1;
      return { count, window };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  public async acquireLock(
    userId: string,
    ownerToken: string,
    lockTtlMs: number,
    nowMs: number
  ): Promise<AcquireLockResult> {
    const pk = buildUserPK(userId);
    const sk = CHATLOCK_SK;
    const expiresAt = nowMs + lockTtlMs;
    // DynamoDB TTL は Unix 秒。ロック満了の少し後に自動削除されるよう余裕を持たせる。
    const ttlSec = Math.floor(expiresAt / 1000) + 300;

    try {
      await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
          UpdateExpression: 'SET OwnerToken = :token, ExpiresAt = :expiresAt, #ttl = :ttl',
          // attribute_not_exists(SK) → 未取得
          // ExpiresAt < :now → 期限切れのロックは上書き可
          ConditionExpression: 'attribute_not_exists(SK) OR ExpiresAt < :now',
          ExpressionAttributeNames: {
            '#ttl': 'TTL',
          },
          ExpressionAttributeValues: {
            ':token': ownerToken,
            ':expiresAt': expiresAt,
            ':ttl': ttlSec,
            ':now': nowMs,
          },
        })
      );
      return { acquired: true, ownerToken };
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        // 有効なロックが存在するため取得失敗
        return { acquired: false };
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  public async releaseLock(userId: string, ownerToken: string): Promise<void> {
    const pk = buildUserPK(userId);
    const sk = CHATLOCK_SK;

    try {
      await this.docClient.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { PK: pk, SK: sk },
          // ownerToken が一致する場合のみ削除する（他リクエストのロックを誤って消さない）。
          ConditionExpression: 'OwnerToken = :token',
          ExpressionAttributeValues: {
            ':token': ownerToken,
          },
        })
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        // ownerToken 不一致（期限切れ・奪取済み）は安全に握りつぶす。
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }
}
