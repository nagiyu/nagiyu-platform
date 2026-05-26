import {
  validateBooleanField,
  validateNumberField,
  validateStringField,
  validateTimestampField,
  type DynamoDBItem,
  type EntityMapper,
} from '@nagiyu/aws';
import type {
  CharacterStateEntity,
  CharacterStateKey,
} from '../entities/character-state.entity.js';
import { buildCharacterStateSK, buildUserPK } from './keys.js';

export class CharacterStateMapper implements EntityMapper<CharacterStateEntity, CharacterStateKey> {
  public readonly entityType = 'CharacterState';

  public toItem(entity: CharacterStateEntity): DynamoDBItem {
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
      AffectionLevel: entity.AffectionLevel,
      LastInteractionAt: entity.LastInteractionAt,
      Onboarded: entity.Onboarded,
      CreatedAt: entity.CreatedAt,
      UpdatedAt: entity.UpdatedAt,
    };
  }

  public toEntity(item: DynamoDBItem): CharacterStateEntity {
    return {
      UserID: validateStringField(item.UserID, 'UserID'),
      CharacterID: validateStringField(item.CharacterID, 'CharacterID'),
      AffectionLevel: validateNumberField(item.AffectionLevel, 'AffectionLevel', { min: 0 }),
      LastInteractionAt: validateTimestampField(item.LastInteractionAt, 'LastInteractionAt'),
      Onboarded: validateBooleanField(item.Onboarded, 'Onboarded'),
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
      UpdatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
    };
  }

  public buildKeys(key: CharacterStateKey): { pk: string; sk: string } {
    return {
      pk: buildUserPK(key.userId),
      sk: buildCharacterStateSK(key.characterId),
    };
  }
}
