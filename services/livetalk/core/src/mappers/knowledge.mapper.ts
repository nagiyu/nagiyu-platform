import {
  validateNumberField,
  validateStringField,
  validateTimestampField,
  type DynamoDBItem,
  type EntityMapper,
} from '@nagiyu/aws';
import type { KnowledgeEntity, KnowledgeKey } from '../entities/knowledge.entity.js';
import { buildKnowledgeSK, buildUserPK } from './keys.js';

export class KnowledgeMapper implements EntityMapper<KnowledgeEntity, KnowledgeKey> {
  public readonly entityType = 'Knowledge';

  public toItem(entity: KnowledgeEntity): DynamoDBItem {
    const { pk, sk } = this.buildKeys({
      userId: entity.UserID,
      characterId: entity.CharacterID,
      knowledgeId: entity.KnowledgeID,
    });
    const item: DynamoDBItem = {
      PK: pk,
      SK: sk,
      Type: this.entityType,
      UserID: entity.UserID,
      CharacterID: entity.CharacterID,
      KnowledgeID: entity.KnowledgeID,
      Topic: entity.Topic,
      Summary: entity.Summary,
      SourceUrls: entity.SourceUrls,
      RawComment: entity.RawComment,
      RelatedCategory: entity.RelatedCategory,
      CreatedAt: entity.CreatedAt,
      UpdatedAt: entity.UpdatedAt,
    };
    if (entity.Ttl !== undefined) {
      item.Ttl = entity.Ttl;
    }
    return item;
  }

  public toEntity(item: DynamoDBItem): KnowledgeEntity {
    const entity: KnowledgeEntity = {
      UserID: validateStringField(item.UserID, 'UserID'),
      CharacterID: validateStringField(item.CharacterID, 'CharacterID'),
      KnowledgeID: validateStringField(item.KnowledgeID, 'KnowledgeID'),
      Topic: validateStringField(item.Topic, 'Topic'),
      Summary: validateStringField(item.Summary, 'Summary'),
      SourceUrls: Array.isArray(item.SourceUrls) ? (item.SourceUrls as string[]) : [],
      RawComment: validateStringField(item.RawComment, 'RawComment'),
      RelatedCategory: validateStringField(item.RelatedCategory, 'RelatedCategory'),
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
      UpdatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
    };
    if (item.Ttl !== undefined) {
      entity.Ttl = validateNumberField(item.Ttl, 'Ttl');
    }
    return entity;
  }

  public buildKeys(key: KnowledgeKey): { pk: string; sk: string } {
    return {
      pk: buildUserPK(key.userId),
      sk: buildKnowledgeSK(key.characterId, key.knowledgeId),
    };
  }
}
