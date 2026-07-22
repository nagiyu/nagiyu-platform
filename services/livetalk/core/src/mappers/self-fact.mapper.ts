import {
  validateStringField,
  validateTimestampField,
  type DynamoDBItem,
  type EntityMapper,
} from '@nagiyu/aws';
import type { SelfFactEntity, SelfFactKey } from '../entities/self-fact.entity.js';
import { buildSelfFactSK, buildUserPK } from './keys.js';

/**
 * `SelfFactEntity ↔ DynamoDB Item` の変換と PK/SK 組み立てを担当する Mapper。
 */
export class SelfFactMapper implements EntityMapper<SelfFactEntity, SelfFactKey> {
  public readonly entityType = 'SelfFact';

  public toItem(entity: SelfFactEntity): DynamoDBItem {
    const { pk, sk } = this.buildKeys({
      userId: entity.UserID,
      characterId: entity.CharacterID,
      topicId: entity.TopicID,
      factId: entity.FactID,
    });

    return {
      PK: pk,
      SK: sk,
      Type: this.entityType,
      UserID: entity.UserID,
      CharacterID: entity.CharacterID,
      TopicID: entity.TopicID,
      FactID: entity.FactID,
      Text: entity.Text,
      Provenance: entity.Provenance,
      CreatedAt: entity.CreatedAt,
      // SelfFact に UpdatedAt は無いが、DynamoDBItem 型は必須のため CreatedAt を複製する
      // （既存の NotificationEventMapper 等と同じ方針）。
      UpdatedAt: entity.CreatedAt,
    };
  }

  public toEntity(item: DynamoDBItem): SelfFactEntity {
    return {
      UserID: validateStringField(item.UserID, 'UserID'),
      CharacterID: validateStringField(item.CharacterID, 'CharacterID'),
      TopicID: validateStringField(item.TopicID, 'TopicID'),
      FactID: validateStringField(item.FactID, 'FactID'),
      Text: validateStringField(item.Text, 'Text'),
      // 出所が特定できない場合を考慮し空文字を許可する
      Provenance: validateStringField(item.Provenance, 'Provenance', { allowEmpty: true }),
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
    };
  }

  public buildKeys(key: SelfFactKey): { pk: string; sk: string } {
    return {
      pk: buildUserPK(key.userId),
      sk: buildSelfFactSK(key.characterId, key.topicId, key.factId),
    };
  }
}
