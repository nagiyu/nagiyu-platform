import {
  validateNumberField,
  validateStringField,
  validateTimestampField,
  type DynamoDBItem,
  type EntityMapper,
} from '@nagiyu/aws';
import type {
  ConsolidationCursorEntity,
  ConsolidationCursorKey,
} from '../entities/consolidation-cursor.entity.js';
import { buildConsolidationCursorSK, buildUserPK } from './keys.js';

/**
 * `ConsolidationCursorEntity ↔ DynamoDB Item` の変換と PK/SK 組み立てを担当する Mapper。
 */
export class ConsolidationCursorMapper implements EntityMapper<
  ConsolidationCursorEntity,
  ConsolidationCursorKey
> {
  public readonly entityType = 'ConsolidationCursor';

  public toItem(entity: ConsolidationCursorEntity): DynamoDBItem {
    const { pk, sk } = this.buildKeys({
      userId: entity.UserID,
      characterId: entity.CharacterID,
    });

    return {
      PK: pk,
      SK: sk,
      Type: this.entityType,
      UserID: entity.UserID,
      CharacterID: entity.CharacterID,
      MsgCursor: entity.MsgCursor,
      WebrawCursor: entity.WebrawCursor,
      UpdatedAt: entity.UpdatedAt,
      // ConsolidationCursor に CreatedAt は無いが、DynamoDBItem 型は必須のため UpdatedAt を複製する
      // （既存の NotificationEventMapper 等と同じ方針）。
      CreatedAt: entity.UpdatedAt,
    };
  }

  public toEntity(item: DynamoDBItem): ConsolidationCursorEntity {
    return {
      UserID: validateStringField(item.UserID, 'UserID'),
      CharacterID: validateStringField(item.CharacterID, 'CharacterID'),
      MsgCursor: validateNumberField(item.MsgCursor, 'MsgCursor', { min: 0 }),
      WebrawCursor: validateNumberField(item.WebrawCursor, 'WebrawCursor', { min: 0 }),
      UpdatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
    };
  }

  public buildKeys(key: ConsolidationCursorKey): { pk: string; sk: string } {
    return {
      pk: buildUserPK(key.userId),
      sk: buildConsolidationCursorSK(key.characterId),
    };
  }
}
