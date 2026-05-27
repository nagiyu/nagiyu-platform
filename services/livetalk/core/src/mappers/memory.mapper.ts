import {
  validateEnumField,
  validateNumberField,
  validateStringField,
  type DynamoDBItem,
  type EntityMapper,
} from '@nagiyu/aws';
import { TIERS, type MemoryEntity, type MemoryKey, type Tier } from '../entities/memory.entity.js';
import { buildMemorySK, buildUserPK } from './keys.js';

export class MemoryMapper implements EntityMapper<MemoryEntity, MemoryKey> {
  public readonly entityType = 'Memory';

  public toItem(entity: MemoryEntity): DynamoDBItem {
    const { pk, sk } = this.buildKeys({
      userId: entity.UserID,
      characterId: entity.CharacterID,
      tier: entity.Tier,
      category: entity.Category,
      memoryId: entity.MemoryID,
    });

    const item: DynamoDBItem = {
      PK: pk,
      SK: sk,
      Type: this.entityType,
      UserID: entity.UserID,
      CharacterID: entity.CharacterID,
      MemoryID: entity.MemoryID,
      Tier: entity.Tier,
      Category: entity.Category,
      Content: entity.Content,
      Confidence: entity.Confidence,
      ReferencedCount: entity.ReferencedCount,
      CreatedAt: entity.CreatedAt,
      UpdatedAt: entity.UpdatedAt,
    };

    if (entity.LastReferencedAt !== undefined) {
      item.LastReferencedAt = entity.LastReferencedAt;
    }
    if (entity.Embedding !== undefined) {
      item.Embedding = entity.Embedding;
    }

    return item;
  }

  public toEntity(item: DynamoDBItem): MemoryEntity {
    const tier = validateEnumField(item.Tier, 'Tier', TIERS) as Tier;

    const entity: MemoryEntity = {
      UserID: validateStringField(item.UserID, 'UserID'),
      CharacterID: validateStringField(item.CharacterID, 'CharacterID'),
      MemoryID: validateStringField(item.MemoryID, 'MemoryID'),
      Tier: tier,
      Category: validateStringField(item.Category, 'Category'),
      Content: validateStringField(item.Content, 'Content', { allowEmpty: true }),
      Confidence: validateNumberField(item.Confidence, 'Confidence', { min: 0, max: 1 }),
      ReferencedCount: validateNumberField(item.ReferencedCount, 'ReferencedCount', {
        min: 0,
        integer: true,
      }),
      CreatedAt: validateStringField(item.CreatedAt, 'CreatedAt'),
      UpdatedAt: validateStringField(item.UpdatedAt, 'UpdatedAt'),
    };

    if (item.LastReferencedAt !== undefined) {
      entity.LastReferencedAt = validateStringField(item.LastReferencedAt, 'LastReferencedAt');
    }
    if (item.Embedding !== undefined && Array.isArray(item.Embedding)) {
      entity.Embedding = item.Embedding as number[];
    }

    return entity;
  }

  public buildKeys(key: MemoryKey): { pk: string; sk: string } {
    return {
      pk: buildUserPK(key.userId),
      sk: buildMemorySK(key.characterId, key.tier, key.category, key.memoryId),
    };
  }
}
