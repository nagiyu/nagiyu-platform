import {
  immutablePatchValue,
  optionalPatchValue,
  readTimestamp,
  requiredPatchValue,
  validateArrayField,
  validateNumberField,
  validateStringField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
} from '@nagiyu/aws';
import type { TopicEntity, TopicKey } from '../entities/topic.entity.js';
import { buildTopicGSI3PK, buildTopicMetaSK, buildUserPK } from './keys.js';

/**
 * `TopicEntity ↔ DynamoDB Item` の変換と PK/SK 組み立てを担当する Mapper。
 *
 * META item には GSI3（GSI-TOPIC）用の GSI3PK/GSI3SK を必ず付与する
 * （sparse GSI。SELF/WEB/WEBRAW/CURSOR は付与しない）。
 *
 * `toEntity` は GSI3 の Query 結果（`Care` 属性は投影せず `GSI3SK` に重複させている）
 * も同じロジックで扱えるよう、`Care` が無ければ `GSI3SK` にフォールバックする。
 */
export class TopicMapper implements EntityMapper<TopicEntity, TopicKey> {
  public readonly entityType = 'Topic';

  public buildKeys(key: TopicKey): DynamoDBKey {
    return {
      PK: buildUserPK(key.userId),
      SK: buildTopicMetaSK(key.characterId, key.topicId),
    };
  }

  public getKey(entity: TopicEntity): TopicKey {
    return { userId: entity.userId, characterId: entity.characterId, topicId: entity.topicId };
  }

  public toItem(entity: TopicEntity): DynamoDBAttributes {
    return {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      UserID: entity.userId,
      CharacterID: entity.characterId,
      TopicID: entity.topicId,
      Subject: entity.subject,
      CanonicalSummary: entity.canonicalSummary,
      Category: entity.category,
      Care: entity.care,
      Embedding: entity.embedding,
      CreatedAt: entity.createdAt,
      UpdatedAt: entity.updatedAt,
      // 全 Topic META に必ず付与し、GSI3 の Query で列挙・care 降順取得できるようにする
      GSI3PK: buildTopicGSI3PK(entity.characterId, entity.userId),
      GSI3SK: entity.care,
      // requestText / requestedAt は GSI3 に投影しない。依頼フックはベーステーブル読みでのみ使い、
      // Topic ヘッダの列挙・care 降順取得には使わないため
      ...(entity.requestText !== undefined && { RequestText: entity.requestText }),
      ...(entity.requestedAt !== undefined && { RequestedAt: entity.requestedAt }),
    };
  }

  /**
   * GSI3PK は key から付け直し、GSI3SK は Care と同値のため care を変えるときだけ付け直す。
   * これにより patch に識別子を混ぜさせず、care の更新で GSI3 の並びが食い違わない。
   */
  public toUpdateAttributes(changes: EntityPatch<TopicEntity>, key: TopicKey): DynamoDBAttributes {
    const care = requiredPatchValue(changes.care, 'Care');
    return {
      UserID: immutablePatchValue(changes.userId, 'UserID'),
      CharacterID: immutablePatchValue(changes.characterId, 'CharacterID'),
      TopicID: immutablePatchValue(changes.topicId, 'TopicID'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      Subject: requiredPatchValue(changes.subject, 'Subject'),
      CanonicalSummary: requiredPatchValue(changes.canonicalSummary, 'CanonicalSummary'),
      Category: requiredPatchValue(changes.category, 'Category'),
      Care: care,
      Embedding: requiredPatchValue(changes.embedding, 'Embedding'),
      RequestText: optionalPatchValue(changes.requestText),
      RequestedAt: optionalPatchValue(changes.requestedAt),
      GSI3PK: buildTopicGSI3PK(key.characterId, key.userId),
      GSI3SK: care,
    };
  }

  public toEntity(item: DynamoDBAttributes): TopicEntity {
    // GSI3 の Query 結果は `Care` を投影しないため、重複値である `GSI3SK` から復元する。
    const care =
      item.Care !== undefined
        ? validateNumberField(item.Care, 'Care')
        : validateNumberField(item.GSI3SK, 'GSI3SK');

    return {
      userId: validateStringField(item.UserID, 'UserID'),
      characterId: validateStringField(item.CharacterID, 'CharacterID'),
      topicId: validateStringField(item.TopicID, 'TopicID'),
      subject: validateStringField(item.Subject, 'Subject'),
      canonicalSummary: validateStringField(item.CanonicalSummary, 'CanonicalSummary', {
        allowEmpty: true,
      }),
      category: validateStringField(item.Category, 'Category'),
      care,
      embedding: validateArrayField(item.Embedding, 'Embedding', {
        isElement: (v): v is number => typeof v === 'number',
      }),
      createdAt: readTimestamp(item, 'CreatedAt'),
      updatedAt: readTimestamp(item, 'UpdatedAt'),
      // GSI3 の Query 結果には投影されないため、ベーステーブル読みのときのみ present
      ...(item.RequestText !== undefined && {
        requestText: validateStringField(item.RequestText, 'RequestText'),
      }),
      ...(item.RequestedAt !== undefined && {
        requestedAt: validateNumberField(item.RequestedAt, 'RequestedAt'),
      }),
    };
  }
}
