import {
  TTL_ATTRIBUTE_NAME,
  immutablePatchValue,
  optionalPatchValue,
  readOptionalTimestamp,
  readTimestamp,
  toTtlSeconds,
  validateStringField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
} from '@nagiyu/aws';
import type {
  FreshnessCheckRequestEntity,
  FreshnessCheckRequestKey,
} from '../entities/freshness-check-request.entity.js';
import { buildFreshnessCheckRequestSK, buildUserPK } from './keys.js';

/**
 * `FreshnessCheckRequestEntity ↔ DynamoDB Item` の変換と PK/SK 組み立てを担当する Mapper。
 */
export class FreshnessCheckRequestMapper implements EntityMapper<
  FreshnessCheckRequestEntity,
  FreshnessCheckRequestKey
> {
  public readonly entityType = 'FreshnessCheckRequest';

  public buildKeys(key: FreshnessCheckRequestKey): DynamoDBKey {
    return {
      PK: buildUserPK(key.userId),
      SK: buildFreshnessCheckRequestSK(key.characterId, key.topicId),
    };
  }

  public getKey(entity: FreshnessCheckRequestEntity): FreshnessCheckRequestKey {
    return {
      userId: entity.userId,
      characterId: entity.characterId,
      topicId: entity.topicId,
    };
  }

  public toItem(entity: FreshnessCheckRequestEntity): DynamoDBAttributes {
    return {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      UserID: entity.userId,
      CharacterID: entity.characterId,
      TopicID: entity.topicId,
      CreatedAt: entity.createdAt,
      UpdatedAt: entity.updatedAt,
      ...(entity.expiresAt !== undefined && {
        [TTL_ATTRIBUTE_NAME]: toTtlSeconds(entity.expiresAt),
      }),
    };
  }

  public toUpdateAttributes(changes: EntityPatch<FreshnessCheckRequestEntity>): DynamoDBAttributes {
    return {
      UserID: immutablePatchValue(changes.userId, 'UserID'),
      CharacterID: immutablePatchValue(changes.characterId, 'CharacterID'),
      TopicID: immutablePatchValue(changes.topicId, 'TopicID'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      [TTL_ATTRIBUTE_NAME]:
        typeof changes.expiresAt === 'number'
          ? toTtlSeconds(changes.expiresAt)
          : optionalPatchValue(changes.expiresAt),
    };
  }

  public toEntity(item: DynamoDBAttributes): FreshnessCheckRequestEntity {
    const expiresAt = readOptionalTimestamp(item, TTL_ATTRIBUTE_NAME);
    return {
      userId: validateStringField(item.UserID, 'UserID'),
      characterId: validateStringField(item.CharacterID, 'CharacterID'),
      topicId: validateStringField(item.TopicID, 'TopicID'),
      createdAt: readTimestamp(item, 'CreatedAt'),
      updatedAt: readTimestamp(item, 'UpdatedAt'),
      ...(expiresAt !== undefined && { expiresAt }),
    };
  }
}
