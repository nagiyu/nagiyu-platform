/**
 * NiconicoMylistAssistant Core - BatchJob Mapper
 *
 * BatchJobEntity ↔ DynamoDB Item の変換を担当
 */

import {
  TTL_ATTRIBUTE_NAME,
  immutablePatchValue,
  optionalPatchValue,
  readAttribute,
  readOptionalTimestamp,
  readTimestamp,
  requiredPatchValue,
  toTtlSeconds,
  validateEnumField,
  validateObjectField,
  validateStringField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
} from '@nagiyu/aws';
import type { PushSubscription } from '@nagiyu/common';
import type { BatchJobEntity, BatchJobKey } from '../entities/batch-job.entity.js';
import type { BatchResult, BatchStatus } from '../types/index.js';

const BATCH_STATUSES = [
  'SUBMITTED',
  'RUNNING',
  'WAITING_FOR_2FA',
  'SUCCEEDED',
  'FAILED',
] as const satisfies readonly BatchStatus[];

/** ジョブの保存期間。完了後の結果を Web が照会できる猶予として 7 日残す */
const BATCH_JOB_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * BatchJob Mapper
 *
 * BatchJobEntity と DynamoDB Item 間の変換を行う。
 * 保存する属性名は PascalCase (頭字語は大文字のまま) で、旧データの camelCase の属性名も読める。
 */
export class BatchJobMapper implements EntityMapper<BatchJobEntity, BatchJobKey> {
  public readonly entityType = 'BATCH_JOB';

  public readonly legacyAttributeNames = {
    JobID: ['jobId'],
    UserID: ['userId'],
    Status: ['status'],
    Result: ['result'],
    TwoFactorAuthCode: ['twoFactorAuthCode'],
    PushSubscription: ['pushSubscription'],
  } as const;

  /**
   * ビジネスキーから PK/SK を構築
   *
   * @param key - BatchJob Key
   * @returns DynamoDB の Key
   */
  public buildKeys(key: BatchJobKey): DynamoDBKey {
    return {
      PK: `USER#${key.userId}`,
      SK: `BATCH_JOB#${key.jobId}`,
    };
  }

  public getKey(entity: BatchJobEntity): BatchJobKey {
    return { jobId: entity.jobId, userId: entity.userId };
  }

  /**
   * Entity を DynamoDB Item に変換
   *
   * TTL は作成日時から求める。作成日時は変更できないため、更新では書き換えない。
   *
   * @param entity - BatchJob Entity
   * @returns DynamoDB Item
   */
  public toItem(entity: BatchJobEntity): DynamoDBAttributes {
    const item: DynamoDBAttributes = {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      JobID: entity.jobId,
      UserID: entity.userId,
      Status: entity.status,
      CreatedAt: entity.createdAt,
      UpdatedAt: entity.updatedAt,
      [TTL_ATTRIBUTE_NAME]: toTtlSeconds(entity.createdAt + BATCH_JOB_TTL_MS),
    };

    if (entity.result !== undefined) {
      item.Result = entity.result;
    }
    if (entity.completedAt !== undefined) {
      item.CompletedAt = entity.completedAt;
    }
    if (entity.twoFactorAuthCode !== undefined) {
      item.TwoFactorAuthCode = entity.twoFactorAuthCode;
    }
    if (entity.pushSubscription !== undefined) {
      item.PushSubscription = entity.pushSubscription;
    }

    return item;
  }

  /**
   * Entity の部分を保存用の属性に変換
   *
   * jobId・userId・createdAt は作成後に変えられないため、含めると拒否する。
   *
   * @param changes - 変更する項目 (undefined は変更なし、null は属性削除)
   * @returns 保存用の属性
   * @throws InvalidEntityDataError 必須項目が null のとき、または変更不可の項目を含むとき
   */
  public toUpdateAttributes(changes: EntityPatch<BatchJobEntity>): DynamoDBAttributes {
    return {
      JobID: immutablePatchValue(changes.jobId, 'JobID'),
      UserID: immutablePatchValue(changes.userId, 'UserID'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      Status: requiredPatchValue(changes.status, 'Status'),
      Result: optionalPatchValue(changes.result),
      CompletedAt: optionalPatchValue(changes.completedAt),
      TwoFactorAuthCode: optionalPatchValue(changes.twoFactorAuthCode),
      PushSubscription: optionalPatchValue(changes.pushSubscription),
    };
  }

  /**
   * DynamoDB Item を Entity に変換
   *
   * 新しい属性名を優先し、なければ旧名を読む。
   *
   * @param item - DynamoDB Item
   * @returns BatchJob Entity
   */
  public toEntity(item: DynamoDBAttributes): BatchJobEntity {
    const legacy = this.legacyAttributeNames;
    const entity: BatchJobEntity = {
      jobId: validateStringField(readAttribute(item, 'JobID', legacy.JobID), 'JobID'),
      userId: validateStringField(readAttribute(item, 'UserID', legacy.UserID), 'UserID'),
      status: validateEnumField(
        readAttribute(item, 'Status', legacy.Status),
        'Status',
        BATCH_STATUSES
      ),
      createdAt: readTimestamp(item, 'CreatedAt'),
      updatedAt: readTimestamp(item, 'UpdatedAt'),
    };

    const result = readAttribute(item, 'Result', legacy.Result);
    if (result !== undefined) {
      entity.result = validateObjectField<BatchResult>(result, 'Result');
    }

    const completedAt = readOptionalTimestamp(item, 'CompletedAt');
    if (completedAt !== undefined) {
      entity.completedAt = completedAt;
    }

    const twoFactorAuthCode = readAttribute(item, 'TwoFactorAuthCode', legacy.TwoFactorAuthCode);
    if (twoFactorAuthCode !== undefined) {
      entity.twoFactorAuthCode = validateStringField(twoFactorAuthCode, 'TwoFactorAuthCode');
    }

    const pushSubscription = readAttribute(item, 'PushSubscription', legacy.PushSubscription);
    if (pushSubscription !== undefined) {
      entity.pushSubscription = this.toPushSubscription(pushSubscription);
    }

    return entity;
  }

  private toPushSubscription(value: unknown): PushSubscription {
    const subscription = validateObjectField(value, 'PushSubscription');
    const keys = validateObjectField(subscription.keys, 'PushSubscription.keys');

    return {
      endpoint: validateStringField(subscription.endpoint, 'PushSubscription.endpoint'),
      keys: {
        p256dh: validateStringField(keys.p256dh, 'PushSubscription.keys.p256dh'),
        auth: validateStringField(keys.auth, 'PushSubscription.keys.auth'),
      },
    };
  }
}
