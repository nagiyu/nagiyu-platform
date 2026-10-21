import {
  immutablePatchValue,
  readTimestamp,
  requiredPatchValue,
  validateStringField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
} from '@nagiyu/aws';
import type { SelfFactEntity, SelfFactKey } from '../entities/self-fact.entity.js';
import { buildSelfFactSK, buildUserPK } from './keys.js';

/**
 * `SelfFactEntity ↔ DynamoDB Item` の変換と PK/SK 組み立てを担当する Mapper。
 *
 * Entity は更新日時を持たないため、`UpdatedAt` は store が書く値だけを保存する。
 */
export class SelfFactMapper implements EntityMapper<SelfFactEntity, SelfFactKey> {
  public readonly entityType = 'SelfFact';

  public buildKeys(key: SelfFactKey): DynamoDBKey {
    return {
      PK: buildUserPK(key.userId),
      SK: buildSelfFactSK(key.characterId, key.topicId, key.factId),
    };
  }

  public getKey(entity: SelfFactEntity): SelfFactKey {
    return {
      userId: entity.userId,
      characterId: entity.characterId,
      topicId: entity.topicId,
      factId: entity.factId,
    };
  }

  public toItem(entity: SelfFactEntity): DynamoDBAttributes {
    return {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      UserID: entity.userId,
      CharacterID: entity.characterId,
      TopicID: entity.topicId,
      FactID: entity.factId,
      Text: entity.text,
      Provenance: entity.provenance,
      CreatedAt: entity.createdAt,
    };
  }

  public toUpdateAttributes(changes: EntityPatch<SelfFactEntity>): DynamoDBAttributes {
    return {
      UserID: immutablePatchValue(changes.userId, 'UserID'),
      CharacterID: immutablePatchValue(changes.characterId, 'CharacterID'),
      TopicID: immutablePatchValue(changes.topicId, 'TopicID'),
      FactID: immutablePatchValue(changes.factId, 'FactID'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      Text: requiredPatchValue(changes.text, 'Text'),
      Provenance: requiredPatchValue(changes.provenance, 'Provenance'),
    };
  }

  public toEntity(item: DynamoDBAttributes): SelfFactEntity {
    return {
      userId: validateStringField(item.UserID, 'UserID'),
      characterId: validateStringField(item.CharacterID, 'CharacterID'),
      topicId: validateStringField(item.TopicID, 'TopicID'),
      factId: validateStringField(item.FactID, 'FactID'),
      text: validateStringField(item.Text, 'Text'),
      // 出所が特定できない場合を考慮し空文字を許可する
      provenance: validateStringField(item.Provenance, 'Provenance', { allowEmpty: true }),
      createdAt: readTimestamp(item, 'CreatedAt'),
    };
  }
}
