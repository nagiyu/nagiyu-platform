import {
  InvalidEntityDataError,
  validateNumberField,
  validateStringField,
  validateTimestampField,
  type DynamoDBItem,
  type EntityMapper,
} from '@nagiyu/aws';
import type { TopicEntity, TopicKey } from '../entities/topic.entity.js';
import { buildTopicGSI3PK, buildTopicMetaSK, buildUserPK } from './keys.js';

/**
 * 数値配列フィールドをバリデーションする（Embedding 用の最小限チェック）。
 * `@nagiyu/aws` には数値配列専用のバリデータが無いため、ここで自前実装する。
 */
function validateNumberArrayField(value: unknown, fieldName: string): number[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'number')) {
    throw new InvalidEntityDataError(`フィールド "${fieldName}" が数値配列ではありません`);
  }
  return value as number[];
}

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

  public toItem(entity: TopicEntity): DynamoDBItem {
    const { pk, sk } = this.buildKeys({
      userId: entity.UserID,
      characterId: entity.CharacterID,
      topicId: entity.TopicID,
    });

    return {
      PK: pk,
      SK: sk,
      Type: this.entityType,
      UserID: entity.UserID,
      CharacterID: entity.CharacterID,
      TopicID: entity.TopicID,
      Subject: entity.Subject,
      CanonicalSummary: entity.CanonicalSummary,
      Category: entity.Category,
      Care: entity.Care,
      Embedding: entity.Embedding,
      CreatedAt: entity.CreatedAt,
      UpdatedAt: entity.UpdatedAt,
      // GSI3（GSI-TOPIC）: Topic ヘッダ(META) のみを sparse 索引化する（#3697）
      // 全 Topic META に必ず付与することで、GSI3 クエリで列挙・care 降順取得できるようにする
      GSI3PK: buildTopicGSI3PK(entity.CharacterID, entity.UserID),
      GSI3SK: entity.Care,
    };
  }

  public toEntity(item: DynamoDBItem): TopicEntity {
    // GSI3 の Query 結果は `Care` を投影しないため、重複値である `GSI3SK` から復元する。
    const care =
      item.Care !== undefined
        ? validateNumberField(item.Care, 'Care')
        : validateNumberField(item.GSI3SK, 'GSI3SK');

    return {
      UserID: validateStringField(item.UserID, 'UserID'),
      CharacterID: validateStringField(item.CharacterID, 'CharacterID'),
      TopicID: validateStringField(item.TopicID, 'TopicID'),
      Subject: validateStringField(item.Subject, 'Subject'),
      CanonicalSummary: validateStringField(item.CanonicalSummary, 'CanonicalSummary', {
        allowEmpty: true,
      }),
      Category: validateStringField(item.Category, 'Category'),
      Care: care,
      Embedding: validateNumberArrayField(item.Embedding, 'Embedding'),
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
      UpdatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
    };
  }

  public buildKeys(key: TopicKey): { pk: string; sk: string } {
    return {
      pk: buildUserPK(key.userId),
      sk: buildTopicMetaSK(key.characterId, key.topicId),
    };
  }
}
