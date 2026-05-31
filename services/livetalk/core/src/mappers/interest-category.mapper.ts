import {
  validateNumberField,
  validateStringField,
  validateTimestampField,
  type DynamoDBItem,
  type EntityMapper,
} from '@nagiyu/aws';
import type {
  InterestCategoryEntity,
  InterestCategoryKey,
} from '../entities/interest-category.entity.js';
import { buildInterestSK, buildUserPK } from './keys.js';

export class InterestCategoryMapper implements EntityMapper<
  InterestCategoryEntity,
  InterestCategoryKey
> {
  public readonly entityType = 'InterestCategory';

  public toItem(entity: InterestCategoryEntity): DynamoDBItem {
    const { pk, sk } = this.buildKeys({
      userId: entity.UserID,
      characterId: entity.CharacterID,
      category: entity.Category,
    });
    return {
      PK: pk,
      SK: sk,
      Type: this.entityType,
      UserID: entity.UserID,
      CharacterID: entity.CharacterID,
      Category: entity.Category,
      Weight: entity.Weight,
      CreatedAt: entity.CreatedAt,
      UpdatedAt: entity.UpdatedAt,
    };
  }

  public toEntity(item: DynamoDBItem): InterestCategoryEntity {
    return {
      UserID: validateStringField(item.UserID, 'UserID'),
      CharacterID: validateStringField(item.CharacterID, 'CharacterID'),
      Category: validateStringField(item.Category, 'Category'),
      Weight: validateNumberField(item.Weight, 'Weight'),
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
      UpdatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
    };
  }

  public buildKeys(key: InterestCategoryKey): { pk: string; sk: string } {
    return {
      pk: buildUserPK(key.userId),
      sk: buildInterestSK(key.characterId, key.category),
    };
  }
}
