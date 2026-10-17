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
import type { MessageEntity, MessageKey } from '../entities/message.entity.js';
import { buildMessageSK, buildUserPK } from './keys.js';

/**
 * `MessageEntity ↔ DynamoDB Item` の変換と PK/SK 組み立てを担当する Mapper。
 */
export class MessageMapper implements EntityMapper<MessageEntity, MessageKey> {
  public readonly entityType = 'Message';

  public buildKeys(key: MessageKey): DynamoDBKey {
    return {
      PK: buildUserPK(key.userId),
      SK: buildMessageSK(key.characterId, key.messageId),
    };
  }

  public getKey(entity: MessageEntity): MessageKey {
    return {
      userId: entity.userId,
      characterId: entity.characterId,
      messageId: entity.messageId,
    };
  }

  public toItem(entity: MessageEntity): DynamoDBAttributes {
    return {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      UserID: entity.userId,
      CharacterID: entity.characterId,
      MessageID: entity.messageId,
      Role: entity.role,
      Text: entity.text,
      CreatedAt: entity.createdAt,
      UpdatedAt: entity.updatedAt,
      ...(entity.expiresAt !== undefined && {
        [TTL_ATTRIBUTE_NAME]: toTtlSeconds(entity.expiresAt),
      }),
    };
  }

  public toUpdateAttributes(changes: EntityPatch<MessageEntity>): DynamoDBAttributes {
    return {
      UserID: immutablePatchValue(changes.userId, 'UserID'),
      CharacterID: immutablePatchValue(changes.characterId, 'CharacterID'),
      MessageID: immutablePatchValue(changes.messageId, 'MessageID'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      Role: requiredPatchValue(changes.role, 'Role'),
      Text: requiredPatchValue(changes.text, 'Text'),
      [TTL_ATTRIBUTE_NAME]:
        typeof changes.expiresAt === 'number'
          ? toTtlSeconds(changes.expiresAt)
          : optionalPatchValue(changes.expiresAt),
    };
  }

  public toEntity(item: DynamoDBAttributes): MessageEntity {
    const expiresAt = readOptionalTimestamp(item, TTL_ATTRIBUTE_NAME);
    return {
      userId: validateStringField(item.UserID, 'UserID'),
      characterId: validateStringField(item.CharacterID, 'CharacterID'),
      messageId: validateStringField(item.MessageID, 'MessageID'),
      role: validateEnumField(item.Role, 'Role', ['user', 'assistant'] as const),
      // モデルがエラーで空応答した場合のログも残すため、本文は空文字を許可する
      text: validateStringField(item.Text, 'Text', { allowEmpty: true }),
      createdAt: readTimestamp(item, 'CreatedAt'),
      updatedAt: readTimestamp(item, 'UpdatedAt'),
      ...(expiresAt !== undefined && { expiresAt }),
    };
  }
}
