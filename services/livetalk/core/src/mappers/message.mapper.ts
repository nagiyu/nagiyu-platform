import {
  validateEnumField,
  validateStringField,
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

    return {
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
  }

  public toEntity(item: DynamoDBItem): MessageEntity {
    const role = validateEnumField(item.Role, 'Role', ['user', 'assistant'] as const);

    return {
      UserID: validateStringField(item.UserID, 'UserID'),
      CharacterID: validateStringField(item.CharacterID, 'CharacterID'),
      MessageID: validateStringField(item.MessageID, 'MessageID'),
      Role: role,
      // Text は空文字を許可する（例: モデルがエラーで空応答した場合のログ性質）。
      Text: validateStringField(item.Text, 'Text', { allowEmpty: true }),
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
      UpdatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
    };
  }

  public buildKeys(key: MessageKey): { pk: string; sk: string } {
    return {
      pk: buildUserPK(key.userId),
      sk: buildMessageSK(key.characterId, key.messageId),
    };
  }
}
