import {
  validateStringField,
  validateTimestampField,
  type DynamoDBItem,
  type EntityMapper,
} from '@nagiyu/aws';
import type { WebRawEntity, WebRawKey } from '../entities/webraw.entity.js';
import { buildUserPK, buildWebRawSK } from './keys.js';

/**
 * `WebRawEntity ↔ DynamoDB Item` の変換と PK/SK 組み立てを担当する Mapper。
 * TTL 属性の付与はリポジトリ側の責務とする（既存 Message と同じ方針）。
 */
export class WebRawMapper implements EntityMapper<WebRawEntity, WebRawKey> {
  public readonly entityType = 'WebRaw';

  public toItem(entity: WebRawEntity): DynamoDBItem {
    const { pk, sk } = this.buildKeys({
      userId: entity.UserID,
      characterId: entity.CharacterID,
      rawId: entity.RawID,
    });

    return {
      PK: pk,
      SK: sk,
      Type: this.entityType,
      UserID: entity.UserID,
      CharacterID: entity.CharacterID,
      RawID: entity.RawID,
      Query: entity.Query,
      RawText: entity.RawText,
      SourceUrls: entity.SourceUrls,
      CreatedAt: entity.CreatedAt,
      // WebRaw に UpdatedAt は無いが、DynamoDBItem 型は必須のため CreatedAt を複製する
      // （既存の NotificationEventMapper 等と同じ方針）。
      UpdatedAt: entity.CreatedAt,
    };
  }

  public toEntity(item: DynamoDBItem): WebRawEntity {
    return {
      UserID: validateStringField(item.UserID, 'UserID'),
      CharacterID: validateStringField(item.CharacterID, 'CharacterID'),
      RawID: validateStringField(item.RawID, 'RawID'),
      Query: validateStringField(item.Query, 'Query'),
      RawText: validateStringField(item.RawText, 'RawText', { allowEmpty: true }),
      SourceUrls: Array.isArray(item.SourceUrls) ? (item.SourceUrls as string[]) : [],
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
    };
  }

  public buildKeys(key: WebRawKey): { pk: string; sk: string } {
    return {
      pk: buildUserPK(key.userId),
      sk: buildWebRawSK(key.characterId, key.rawId),
    };
  }
}
