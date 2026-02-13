/**
 * NiconicoMylistAssistant Core - BatchJob Mapper
 *
 * BatchJobEntity ↔ DynamoDBItem の変換を担当
 */

import type { DynamoDBItem, EntityMapper } from '@nagiyu/aws';
import { validateStringField, validateTimestampField } from '@nagiyu/aws';
import type {
  BatchJobEntity,
  BatchJobKey,
  UpdateBatchJobInput,
} from '../entities/batch-job.entity.js';
import type { BatchStatus, BatchResult } from '../types/index.js';

/**
 * BatchJob Mapper
 *
 * BatchJobEntity と DynamoDB Item 間の変換を行う
 */
export class BatchJobMapper implements EntityMapper<BatchJobEntity, BatchJobKey> {
  private readonly entityType = 'BATCH_JOB';

  /**
   * Entity を DynamoDB Item に変換
   *
   * @param entity - BatchJob Entity
   * @returns DynamoDB Item
   */
  public toItem(entity: BatchJobEntity): DynamoDBItem {
    const { pk, sk } = this.buildKeys({
      jobId: entity.jobId,
      userId: entity.userId,
    });

    const item: DynamoDBItem = {
      PK: pk,
      SK: sk,
      Type: this.entityType,
      jobId: entity.jobId,
      userId: entity.userId,
      status: entity.status,
      CreatedAt: entity.CreatedAt,
      UpdatedAt: entity.UpdatedAt,
    };

    if (entity.result !== undefined) {
      item.result = entity.result;
    }

    if (entity.CompletedAt !== undefined) {
      item.CompletedAt = entity.CompletedAt;
    }

    if (entity.twoFactorAuthCode !== undefined) {
      item.twoFactorAuthCode = entity.twoFactorAuthCode;
    }

    if (entity.pushSubscription !== undefined) {
      item.pushSubscription = entity.pushSubscription;
    }

    // TTL を設定（7日後）
    const ttl = Math.floor(entity.CreatedAt / 1000) + 7 * 24 * 60 * 60;
    item.TTL = ttl;

    return item;
  }

  /**
   * DynamoDB Item を Entity に変換
   *
   * @param item - DynamoDB Item
   * @returns BatchJob Entity
   */
  public toEntity(item: DynamoDBItem): BatchJobEntity {
    const entity: BatchJobEntity = {
      jobId: validateStringField(item.jobId, 'jobId'),
      userId: validateStringField(item.userId, 'userId'),
      status: validateStringField(item.status, 'status') as BatchStatus,
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
      UpdatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
    };

    if (item.result !== undefined) {
      entity.result = item.result as BatchResult;
    }

    if (item.CompletedAt !== undefined) {
      entity.CompletedAt = validateTimestampField(item.CompletedAt, 'CompletedAt');
    }

    if (item.twoFactorAuthCode !== undefined) {
      entity.twoFactorAuthCode = validateStringField(item.twoFactorAuthCode, 'twoFactorAuthCode');
    }

    if (item.pushSubscription !== undefined) {
      entity.pushSubscription = item.pushSubscription as {
        endpoint: string;
        keys: {
          p256dh: string;
          auth: string;
        };
      };
    }

    return entity;
  }

  /**
   * ビジネスキーから PK/SK を構築
   *
   * @param key - BatchJob Key
   * @returns PK と SK
   */
  public buildKeys(key: BatchJobKey): { pk: string; sk: string } {
    return {
      pk: `USER#${key.userId}`,
      sk: `BATCH_JOB#${key.jobId}`,
    };
  }

  /**
   * UpdateInput から更新用の属性値を構築
   *
   * @param input - 更新入力
   * @returns 更新属性値のマップ
   */
  public buildUpdateAttributes(input: UpdateBatchJobInput): Record<string, unknown> {
    const now = Date.now();
    const attributes: Record<string, unknown> = {
      status: input.status,
      UpdatedAt: now,
    };

    if (input.result !== undefined) {
      attributes.result = input.result;
    }

    if (input.completedAt !== undefined) {
      attributes.CompletedAt = input.completedAt;
    }

    if (input.twoFactorAuthCode !== undefined) {
      attributes.twoFactorAuthCode = input.twoFactorAuthCode;
    }

    return attributes;
  }
}
