import {
  immutablePatchValue,
  readTimestamp,
  requiredPatchValue,
  validateNumberField,
  validateStringField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
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

  public buildKeys(key: ConsolidationCursorKey): DynamoDBKey {
    return {
      PK: buildUserPK(key.userId),
      SK: buildConsolidationCursorSK(key.characterId),
    };
  }

  public getKey(entity: ConsolidationCursorEntity): ConsolidationCursorKey {
    return { userId: entity.userId, characterId: entity.characterId };
  }

  public toItem(entity: ConsolidationCursorEntity): DynamoDBAttributes {
    return {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      UserID: entity.userId,
      CharacterID: entity.characterId,
      MsgCursor: entity.msgCursor,
      WebrawCursor: entity.webrawCursor,
      UpdatedAt: entity.updatedAt,
      // Entity に作成日時は無いが、保存済みアイテムの属性構成を変えないため CreatedAt も書く。
      // UpdatedAt は store が書き直すので、両者は数ミリ秒ずれることがある
      CreatedAt: entity.updatedAt,
    };
  }

  public toUpdateAttributes(changes: EntityPatch<ConsolidationCursorEntity>): DynamoDBAttributes {
    return {
      UserID: immutablePatchValue(changes.userId, 'UserID'),
      CharacterID: immutablePatchValue(changes.characterId, 'CharacterID'),
      MsgCursor: requiredPatchValue(changes.msgCursor, 'MsgCursor'),
      WebrawCursor: requiredPatchValue(changes.webrawCursor, 'WebrawCursor'),
    };
  }

  public toEntity(item: DynamoDBAttributes): ConsolidationCursorEntity {
    return {
      userId: validateStringField(item.UserID, 'UserID'),
      characterId: validateStringField(item.CharacterID, 'CharacterID'),
      msgCursor: validateNumberField(item.MsgCursor, 'MsgCursor', { min: 0 }),
      webrawCursor: validateNumberField(item.WebrawCursor, 'WebrawCursor', { min: 0 }),
      updatedAt: readTimestamp(item, 'UpdatedAt'),
    };
  }
}
