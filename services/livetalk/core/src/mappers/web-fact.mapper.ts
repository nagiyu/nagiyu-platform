import {
  validateEnumField,
  validateStringField,
  validateTimestampField,
  type DynamoDBItem,
  type EntityMapper,
} from '@nagiyu/aws';
import type { WebFactEntity, WebFactKey, WebFactVolatility } from '../entities/web-fact.entity.js';
import { buildUserPK, buildWebFactSK, buildTopicStaleGSI4PK } from './keys.js';

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
    // GSI4（GSI-STALE）は sparse GSI のため、NextReview があるときだけ GSI4PK/GSI4SK を
    // 付与する（stable fact は掃引対象外にする＝GSI4 に一切現れないようにする）。
    if (entity.NextReview !== undefined) {
      item.NextReview = entity.NextReview;
      item.GSI4PK = buildTopicStaleGSI4PK(entity.CharacterID, entity.UserID);
      item.GSI4SK = entity.NextReview;
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

    // GSI4 の Query 結果には NextReview 自体も INCLUDE 射影で含まれるが、念のため
    // GSI4SK（同値のはず）からも復元できるようにフォールバックする。
    const nextReviewSource = item.NextReview ?? item.GSI4SK;
    if (nextReviewSource !== undefined) {
      entity.NextReview = validateTimestampField(nextReviewSource, 'NextReview');
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
