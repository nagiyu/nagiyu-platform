/**
 * ChatGuardRepository の DynamoDB 実装。
 *
 * Single Table 設計のメインテーブルに相乗りし、レート制限は共通の回数カウンターで数える。PK は既存の `USER#<userId>` を使用する。
 *
 * アイテム種別:
 * - レートリミット: SK = `RATELIMIT#<window>#<bucket>`
 * - ロック:        SK = `CHATLOCK`
 *
 * DynamoDB TTL の物理削除は最大 48h 遅延しうるため、ロック失効判定は TTL に依存せず
 * `ExpiresAt < :now` の条件付き UpdateItem で上書き取得できる設計にしている。
 */

import { DeleteCommand, UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBUsageCounter, isConditionalCheckFailed, toDatabaseError } from '@nagiyu/aws';
import { computeLockTtlSec } from '../lib/chat-guard-window.js';
import { buildUserPK, buildChatLockSK } from '../mappers/keys.js';
import { tryConsumeChatRateLimit } from './chat-guard-counting.js';
import type {
  AcquireLockResult,
  ChatGuardRepository,
  RateLimitLimits,
  TryConsumeRateLimitResult,
} from './chat-guard.repository.interface.js';

export class DynamoDBChatGuardRepository implements ChatGuardRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly counter: DynamoDBUsageCounter;
  private readonly nowMs: () => number;

  constructor(
    docClient: DynamoDBDocumentClient,
    tableName: string,
    nowMs: () => number = () => Date.now()
  ) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.counter = new DynamoDBUsageCounter(docClient, tableName);
    this.nowMs = nowMs;
  }

  public async tryConsumeRateLimit(
    userId: string,
    nowMs: number,
    limits: RateLimitLimits
  ): Promise<TryConsumeRateLimitResult> {
    return tryConsumeChatRateLimit(this.counter, userId, nowMs, limits);
  }

  public async acquireLock(
    userId: string,
    ownerToken: string,
    lockTtlMs: number,
    nowMs: number
  ): Promise<AcquireLockResult> {
    const pk = buildUserPK(userId);
    const sk = buildChatLockSK();
    const expiresAt = nowMs + lockTtlMs;
    // DynamoDB TTL は Unix 秒
    const ttlSec = computeLockTtlSec(expiresAt);

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
      if (isConditionalCheckFailed(error)) {
        // 有効なロックが存在するため取得失敗
        return { acquired: false };
      }
      throw toDatabaseError(error);
    }
  }

  public async releaseLock(userId: string, ownerToken: string): Promise<void> {
    const pk = buildUserPK(userId);
    const sk = buildChatLockSK();

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
    } catch {
      // ownerToken 不一致（期限切れ・奪取済み）は安全に握りつぶす。
      // DynamoDB 障害時もフェイルオープン方針に合わせて握りつぶす（警告は route 層で行う）。
      // ロックは TTL（CHAT_LOCK_TTL_MS）で自然失効するため、解放失敗は許容できる。
    }
  }
}
