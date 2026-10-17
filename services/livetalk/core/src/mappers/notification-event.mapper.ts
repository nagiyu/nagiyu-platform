import {
  TTL_ATTRIBUTE_NAME,
  immutablePatchValue,
  optionalPatchValue,
  readOptionalTimestamp,
  readTimestamp,
  requiredPatchValue,
  toTtlSeconds,
  validateEnumField,
  validateStringField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
} from '@nagiyu/aws';
import type {
  NotificationEventEntity,
  NotificationEventKey,
} from '../entities/notification-event.entity.js';
import { DEFAULT_CHARACTER_ID } from '../constants.js';
import { buildNotifSK, buildUserPK } from './keys.js';

/** 旧データが TTL を保存していた属性名。テーブルの TTL 属性ではないため期限で消えない */
const LEGACY_TTL_ATTRIBUTE_NAMES = ['Ttl'] as const;

/**
 * `NotificationEventEntity ↔ DynamoDB Item` の変換と PK/SK 組み立てを担当する Mapper。
 */
export class NotificationEventMapper implements EntityMapper<
  NotificationEventEntity,
  NotificationEventKey
> {
  public readonly entityType = 'NotificationEvent';

  public readonly legacyAttributeNames = {
    [TTL_ATTRIBUTE_NAME]: LEGACY_TTL_ATTRIBUTE_NAMES,
  } as const;

  public buildKeys(key: NotificationEventKey): DynamoDBKey {
    return {
      PK: buildUserPK(key.userId),
      SK: buildNotifSK(key.notifId),
    };
  }

  public getKey(entity: NotificationEventEntity): NotificationEventKey {
    return { userId: entity.userId, notifId: entity.notifId };
  }

  public toItem(entity: NotificationEventEntity): DynamoDBAttributes {
    return {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      UserID: entity.userId,
      NotifID: entity.notifId,
      CharacterID: entity.characterId,
      Kind: entity.kind,
      Title: entity.title,
      Body: entity.body,
      CreatedAt: entity.createdAt,
      UpdatedAt: entity.updatedAt,
      [TTL_ATTRIBUTE_NAME]: toTtlSeconds(entity.expiresAt),
      ...(entity.topicId !== undefined && { TopicID: entity.topicId }),
      ...(entity.suggestedReply !== undefined && { SuggestedReply: entity.suggestedReply }),
      ...(entity.consumedAt !== undefined && { ConsumedAt: entity.consumedAt }),
    };
  }

  public toUpdateAttributes(changes: EntityPatch<NotificationEventEntity>): DynamoDBAttributes {
    return {
      UserID: immutablePatchValue(changes.userId, 'UserID'),
      NotifID: immutablePatchValue(changes.notifId, 'NotifID'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      CharacterID: requiredPatchValue(changes.characterId, 'CharacterID'),
      Kind: requiredPatchValue(changes.kind, 'Kind'),
      Title: requiredPatchValue(changes.title, 'Title'),
      Body: requiredPatchValue(changes.body, 'Body'),
      [TTL_ATTRIBUTE_NAME]: this.toTtlPatchValue(changes.expiresAt),
      TopicID: optionalPatchValue(changes.topicId),
      SuggestedReply: optionalPatchValue(changes.suggestedReply),
      ConsumedAt: optionalPatchValue(changes.consumedAt),
    };
  }

  public toEntity(item: DynamoDBAttributes): NotificationEventEntity {
    // CharacterID が欠落している旧データは DEFAULT_CHARACTER_ID（hiyori）で補う（後方互換）
    const characterId =
      item.CharacterID !== undefined
        ? validateStringField(item.CharacterID, 'CharacterID')
        : DEFAULT_CHARACTER_ID;
    const consumedAt = readOptionalTimestamp(item, 'ConsumedAt');

    return {
      userId: validateStringField(item.UserID, 'UserID'),
      notifId: validateStringField(item.NotifID, 'NotifID'),
      characterId,
      kind: validateEnumField(item.Kind, 'Kind', ['normal', 'critical'] as const),
      title: validateStringField(item.Title, 'Title'),
      body: validateStringField(item.Body, 'Body'),
      createdAt: readTimestamp(item, 'CreatedAt'),
      // 旧データは UpdatedAt を CreatedAt と同じ値で保存していたため、欠落は想定しない
      updatedAt: readTimestamp(item, 'UpdatedAt'),
      expiresAt: readTimestamp(item, TTL_ATTRIBUTE_NAME, LEGACY_TTL_ATTRIBUTE_NAMES),
      ...(item.TopicID !== undefined && { topicId: validateStringField(item.TopicID, 'TopicID') }),
      ...(item.SuggestedReply !== undefined && {
        suggestedReply: validateStringField(item.SuggestedReply, 'SuggestedReply'),
      }),
      ...(consumedAt !== undefined && { consumedAt }),
    };
  }

  /** expiresAt はミリ秒をエポック秒に換算する。必須項目のため null は拒否する */
  private toTtlPatchValue(expiresAt: number | null | undefined): number | undefined {
    const value = requiredPatchValue(expiresAt, TTL_ATTRIBUTE_NAME);
    return value === undefined ? undefined : toTtlSeconds(value);
  }
}
