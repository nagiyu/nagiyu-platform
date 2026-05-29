import {
  validateStringField,
  validateTimestampField,
  type DynamoDBItem,
  type EntityMapper,
} from '@nagiyu/aws';
import type {
  MemorySummaryEntity,
  MemorySummaryKey,
} from '../entities/memory-summary.entity.js';
import { buildMemorySummarySK, buildUserPK } from './keys.js';

export class MemorySummaryMapper
  implements EntityMapper<MemorySummaryEntity, MemorySummaryKey>
{
  public readonly entityType = 'MemorySummary';

  public toItem(entity: MemorySummaryEntity): DynamoDBItem {
    const { pk, sk } = this.buildKeys({
      userId: entity.UserID,
      characterId: entity.CharacterID,
    });
    return {
      PK: pk,
      SK: sk,
      Type: this.entityType,
      UserID: entity.UserID,
      CharacterID: entity.CharacterID,
      SummaryText: entity.SummaryText,
      LastCompressedAt: entity.LastCompressedAt,
      CreatedAt: entity.CreatedAt,
      UpdatedAt: entity.UpdatedAt,
    };
  }

  public toEntity(item: DynamoDBItem): MemorySummaryEntity {
    return {
      UserID: validateStringField(item.UserID, 'UserID'),
      CharacterID: validateStringField(item.CharacterID, 'CharacterID'),
      SummaryText: validateStringField(item.SummaryText, 'SummaryText', { allowEmpty: true }),
      LastCompressedAt: validateTimestampField(item.LastCompressedAt, 'LastCompressedAt'),
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
      UpdatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
    };
  }

  public buildKeys(key: MemorySummaryKey): { pk: string; sk: string } {
    return {
      pk: buildUserPK(key.userId),
      sk: buildMemorySummarySK(key.characterId),
    };
  }
}
