import {
  validateStringField,
  validateNumberField,
  validateEnumField,
  validateTimestampField,
  type DynamoDBItem,
  type EntityMapper,
} from '@nagiyu/aws';
import type { MessageEntity, MessageKey } from '../entities/message.entity.js';
import { buildMessageSK, buildUserPK } from './keys.js';

/**
 * `MessageEntity ↔ DynamoDB Item` の変換と PK/SK 組み立てを担当する Mapper。
 */
export class MessageMapper implements EntityMapper<MessageEntity, MessageKey> {
  public readonly entityType = 'Message';

  public toItem(entity: MessageEntity): DynamoDBItem {
    const { pk, sk } = this.buildKeys({
      userId: entity.UserID,
      characterId: entity.CharacterID,
      messageId: entity.MessageID,
    });

    const item: DynamoDBItem = {
      PK: pk,
      SK: sk,
      Type: this.entityType,
      UserID: entity.UserID,
      CharacterID: entity.CharacterID,
      MessageID: entity.MessageID,
      Role: entity.Role,
      Text: entity.Text,
      CreatedAt: entity.CreatedAt,
      UpdatedAt: entity.UpdatedAt,
    };

    if (entity.AudioS3Key !== undefined) {
      item.AudioS3Key = entity.AudioS3Key;
    }
    if (entity.TokenCount !== undefined) {
      item.TokenCount = entity.TokenCount;
    }
    if (entity.LatencyMs !== undefined) {
      item.LatencyMs = entity.LatencyMs;
    }
    if (entity.MotionUsed !== undefined) {
      item.MotionUsed = entity.MotionUsed;
    }

    return item;
  }

  public toEntity(item: DynamoDBItem): MessageEntity {
    const role = validateEnumField(item.Role, 'Role', ['user', 'assistant'] as const);

    const entity: MessageEntity = {
      UserID: validateStringField(item.UserID, 'UserID'),
      CharacterID: validateStringField(item.CharacterID, 'CharacterID'),
      MessageID: validateStringField(item.MessageID, 'MessageID'),
      Role: role,
      // Text は空文字を許可する（例: モデルがエラーで空応答した場合のログ性質）。
      Text: validateStringField(item.Text, 'Text', { allowEmpty: true }),
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
      UpdatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
    };

    if (item.AudioS3Key !== undefined) {
      entity.AudioS3Key = validateStringField(item.AudioS3Key, 'AudioS3Key');
    }
    if (item.TokenCount !== undefined) {
      entity.TokenCount = validateNumberField(item.TokenCount, 'TokenCount');
    }
    if (item.LatencyMs !== undefined) {
      entity.LatencyMs = validateNumberField(item.LatencyMs, 'LatencyMs');
    }
    if (item.MotionUsed !== undefined) {
      entity.MotionUsed = validateStringField(item.MotionUsed, 'MotionUsed');
    }

    return entity;
  }

  public buildKeys(key: MessageKey): { pk: string; sk: string } {
    return {
      pk: buildUserPK(key.userId),
      sk: buildMessageSK(key.characterId, key.messageId),
    };
  }
}
