import {
  immutablePatchValue,
  optionalPatchValue,
  readTimestamp,
  requiredPatchValue,
  validateEnumField,
  validateStringField,
  validateTimestampField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
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
 *
 * GSI4（GSI-STALE）は sparse GSI のため、`nextReview` があるときだけ GSI4PK/GSI4SK を付ける。
 * Entity は更新日時を持たないため、`UpdatedAt` は store が書く値だけを保存する。
 */
export class WebFactMapper implements EntityMapper<WebFactEntity, WebFactKey> {
  public readonly entityType = 'WebFact';

  public buildKeys(key: WebFactKey): DynamoDBKey {
    return {
      PK: buildUserPK(key.userId),
      SK: buildWebFactSK(key.characterId, key.topicId, key.factId),
    };
  }

  public getKey(entity: WebFactEntity): WebFactKey {
    return {
      userId: entity.userId,
      characterId: entity.characterId,
      topicId: entity.topicId,
      factId: entity.factId,
    };
  }

  public toItem(entity: WebFactEntity): DynamoDBAttributes {
    return {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      UserID: entity.userId,
      CharacterID: entity.characterId,
      TopicID: entity.topicId,
      FactID: entity.factId,
      Text: entity.text,
      SourceUrls: entity.sourceUrls,
      Volatility: entity.volatility,
      ObservedAt: entity.observedAt,
      CreatedAt: entity.createdAt,
      // stable な fact は NextReview を持たず、GSI4 にも現れない (鮮度掃引の対象外)
      ...(entity.nextReview !== undefined && {
        NextReview: entity.nextReview,
        GSI4PK: buildTopicStaleGSI4PK(entity.characterId, entity.userId),
        GSI4SK: entity.nextReview,
      }),
    };
  }

  /**
   * GSI4 の属性は NextReview を変えるときだけ付け直し、PK は key から組み立てる。
   * NextReview を消すときは GSI4 からも外し、鮮度掃引の対象から外す。
   */
  public toUpdateAttributes(
    changes: EntityPatch<WebFactEntity>,
    key: WebFactKey
  ): DynamoDBAttributes {
    const nextReview = optionalPatchValue(changes.nextReview);
    return {
      UserID: immutablePatchValue(changes.userId, 'UserID'),
      CharacterID: immutablePatchValue(changes.characterId, 'CharacterID'),
      TopicID: immutablePatchValue(changes.topicId, 'TopicID'),
      FactID: immutablePatchValue(changes.factId, 'FactID'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      Text: requiredPatchValue(changes.text, 'Text'),
      SourceUrls: requiredPatchValue(changes.sourceUrls, 'SourceUrls'),
      Volatility: requiredPatchValue(changes.volatility, 'Volatility'),
      ObservedAt: requiredPatchValue(changes.observedAt, 'ObservedAt'),
      NextReview: nextReview,
      GSI4PK:
        typeof nextReview === 'number'
          ? buildTopicStaleGSI4PK(key.characterId, key.userId)
          : nextReview,
      GSI4SK: nextReview,
    };
  }

  public toEntity(item: DynamoDBAttributes): WebFactEntity {
    // GSI4 の Query 結果は NextReview を投影しないため、同値の GSI4SK から復元する
    const nextReviewSource = item.NextReview ?? item.GSI4SK;
    return {
      userId: validateStringField(item.UserID, 'UserID'),
      characterId: validateStringField(item.CharacterID, 'CharacterID'),
      topicId: validateStringField(item.TopicID, 'TopicID'),
      factId: validateStringField(item.FactID, 'FactID'),
      text: validateStringField(item.Text, 'Text'),
      sourceUrls: Array.isArray(item.SourceUrls) ? (item.SourceUrls as string[]) : [],
      volatility: validateEnumField(item.Volatility, 'Volatility', WEB_FACT_VOLATILITIES),
      observedAt: validateTimestampField(item.ObservedAt, 'ObservedAt'),
      createdAt: readTimestamp(item, 'CreatedAt'),
      ...(nextReviewSource !== undefined && {
        nextReview: validateTimestampField(nextReviewSource, 'NextReview'),
      }),
    };
  }
}
