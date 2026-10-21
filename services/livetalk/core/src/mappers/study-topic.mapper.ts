import {
  TTL_ATTRIBUTE_NAME,
  immutablePatchValue,
  optionalPatchValue,
  readOptionalTimestamp,
  readTimestamp,
  requiredPatchValue,
  toTtlSeconds,
  validateEnumField,
  validateNumberField,
  validateStringField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
} from '@nagiyu/aws';
import type { StudyTopicEntity, StudyTopicKey } from '../entities/study-topic.entity.js';
import { buildStudyTopicSK, buildUserPK } from './keys.js';

/** 旧データが TTL を保存していた属性名。テーブルの TTL 属性ではないため期限で消えない */
const LEGACY_TTL_ATTRIBUTE_NAMES = ['Ttl'] as const;

const STUDY_TOPIC_STATUSES = ['pending', 'in_progress', 'done'] as const;

/**
 * `StudyTopicEntity ↔ DynamoDB Item` の変換と PK/SK 組み立てを担当する Mapper。
 */
export class StudyTopicMapper implements EntityMapper<StudyTopicEntity, StudyTopicKey> {
  public readonly entityType = 'StudyTopic';

  public readonly legacyAttributeNames = {
    [TTL_ATTRIBUTE_NAME]: LEGACY_TTL_ATTRIBUTE_NAMES,
  } as const;

  public buildKeys(key: StudyTopicKey): DynamoDBKey {
    return {
      PK: buildUserPK(key.userId),
      SK: buildStudyTopicSK(key.characterId, key.topicId),
    };
  }

  public getKey(entity: StudyTopicEntity): StudyTopicKey {
    return {
      userId: entity.userId,
      characterId: entity.characterId,
      topicId: entity.topicId,
    };
  }

  public toItem(entity: StudyTopicEntity): DynamoDBAttributes {
    return {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      UserID: entity.userId,
      CharacterID: entity.characterId,
      TopicID: entity.topicId,
      Topic: entity.topic,
      Priority: entity.priority,
      Status: entity.status,
      CreatedAt: entity.createdAt,
      UpdatedAt: entity.updatedAt,
      ...(entity.expiresAt !== undefined && {
        [TTL_ATTRIBUTE_NAME]: toTtlSeconds(entity.expiresAt),
      }),
    };
  }

  public toUpdateAttributes(changes: EntityPatch<StudyTopicEntity>): DynamoDBAttributes {
    return {
      UserID: immutablePatchValue(changes.userId, 'UserID'),
      CharacterID: immutablePatchValue(changes.characterId, 'CharacterID'),
      TopicID: immutablePatchValue(changes.topicId, 'TopicID'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      Topic: requiredPatchValue(changes.topic, 'Topic'),
      Priority: requiredPatchValue(changes.priority, 'Priority'),
      Status: requiredPatchValue(changes.status, 'Status'),
      [TTL_ATTRIBUTE_NAME]:
        typeof changes.expiresAt === 'number'
          ? toTtlSeconds(changes.expiresAt)
          : optionalPatchValue(changes.expiresAt),
    };
  }

  public toEntity(item: DynamoDBAttributes): StudyTopicEntity {
    const expiresAt = readOptionalTimestamp(item, TTL_ATTRIBUTE_NAME, LEGACY_TTL_ATTRIBUTE_NAMES);
    return {
      userId: validateStringField(item.UserID, 'UserID'),
      characterId: validateStringField(item.CharacterID, 'CharacterID'),
      topicId: validateStringField(item.TopicID, 'TopicID'),
      topic: validateStringField(item.Topic, 'Topic'),
      priority: validateNumberField(item.Priority, 'Priority'),
      status: validateEnumField(item.Status, 'Status', STUDY_TOPIC_STATUSES),
      createdAt: readTimestamp(item, 'CreatedAt'),
      updatedAt: readTimestamp(item, 'UpdatedAt'),
      ...(expiresAt !== undefined && { expiresAt }),
    };
  }
}
