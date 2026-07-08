import {
  validateEnumField,
  validateStringField,
  validateTimestampField,
  type DynamoDBItem,
  type EntityMapper,
} from '@nagiyu/aws';
import type { WebFactEntity, WebFactKey, WebFactVolatility } from '../entities/web-fact.entity.js';
import { buildUserPK, buildWebFactSK } from './keys.js';

const WEB_FACT_VOLATILITIES: readonly WebFactVolatility[] = [
  'stable',
  'low',
  'medium',
  'high',
] as const;

/**
 * `WebFactEntity ↔ DynamoDB Item` の変換と PK/SK 組み立てを担当する Mapper。
 */
export class WebFactMapper implements EntityMapper<WebFactEntity, WebFactKey> {
  public readonly entityType = 'WebFact';

  public toItem(entity: WebFactEntity): DynamoDBItem {
    const { pk, sk } = this.buildKeys({
      userId: entity.UserID,
      characterId: entity.CharacterID,
      topicId: entity.TopicID,
      factId: entity.FactID,
    });

    const item: DynamoDBItem = {
      PK: pk,
      SK: sk,
      Type: this.entityType,
      UserID: entity.UserID,
      CharacterID: entity.CharacterID,
      TopicID: entity.TopicID,
      FactID: entity.FactID,
      Text: entity.Text,
      SourceUrls: entity.SourceUrls,
      Volatility: entity.Volatility,
      ObservedAt: entity.ObservedAt,
      CreatedAt: entity.CreatedAt,
      // WebFact に UpdatedAt は無いが、DynamoDBItem 型は必須のため CreatedAt を複製する
      // （既存の NotificationEventMapper 等と同じ方針）。
      UpdatedAt: entity.CreatedAt,
    };

    // NextReview は揮発性のある fact（stable 以外）のみ設定する。未設定なら item に含めない。
    if (entity.NextReview !== undefined) {
      item.NextReview = entity.NextReview;
    }

    return item;
  }

  public toEntity(item: DynamoDBItem): WebFactEntity {
    const entity: WebFactEntity = {
      UserID: validateStringField(item.UserID, 'UserID'),
      CharacterID: validateStringField(item.CharacterID, 'CharacterID'),
      TopicID: validateStringField(item.TopicID, 'TopicID'),
      FactID: validateStringField(item.FactID, 'FactID'),
      Text: validateStringField(item.Text, 'Text'),
      SourceUrls: Array.isArray(item.SourceUrls) ? (item.SourceUrls as string[]) : [],
      Volatility: validateEnumField(item.Volatility, 'Volatility', WEB_FACT_VOLATILITIES),
      ObservedAt: validateTimestampField(item.ObservedAt, 'ObservedAt'),
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
    };

    if (item.NextReview !== undefined) {
      entity.NextReview = validateTimestampField(item.NextReview, 'NextReview');
    }

    return entity;
  }

  public buildKeys(key: WebFactKey): { pk: string; sk: string } {
    return {
      pk: buildUserPK(key.userId),
      sk: buildWebFactSK(key.characterId, key.topicId, key.factId),
    };
  }
}
