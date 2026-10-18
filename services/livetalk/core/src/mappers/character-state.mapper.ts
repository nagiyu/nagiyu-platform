import {
  immutablePatchValue,
  optionalPatchValue,
  readTimestamp,
  requiredPatchValue,
  validateStringField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
} from '@nagiyu/aws';
import type {
  CharacterStateEntity,
  CharacterStateKey,
} from '../entities/character-state.entity.js';
import { buildCharacterStateSK, buildUserPK } from './keys.js';

export class CharacterStateMapper implements EntityMapper<CharacterStateEntity, CharacterStateKey> {
  public readonly entityType = 'CharacterState';

  public buildKeys(key: CharacterStateKey): DynamoDBKey {
    return { PK: buildUserPK(key.userId), SK: buildCharacterStateSK(key.characterId) };
  }

  public getKey(entity: CharacterStateEntity): CharacterStateKey {
    return { userId: entity.userId, characterId: entity.characterId };
  }

  public toItem(entity: CharacterStateEntity): DynamoDBAttributes {
    return {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      UserID: entity.userId,
      CharacterID: entity.characterId,
      LastInteractionAt: entity.lastInteractionAt,
      // 旧データは未設定を 0 として扱うため、書くときも 0 に揃える
      AffectionLevel: entity.affectionLevel ?? 0,
      CreatedAt: entity.createdAt,
      UpdatedAt: entity.updatedAt,
    };
  }

  public toUpdateAttributes(changes: EntityPatch<CharacterStateEntity>): DynamoDBAttributes {
    return {
      UserID: immutablePatchValue(changes.userId, 'UserID'),
      CharacterID: immutablePatchValue(changes.characterId, 'CharacterID'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      LastInteractionAt: requiredPatchValue(changes.lastInteractionAt, 'LastInteractionAt'),
      AffectionLevel: optionalPatchValue(changes.affectionLevel),
    };
  }

  public toEntity(item: DynamoDBAttributes): CharacterStateEntity {
    return {
      userId: validateStringField(item.UserID, 'UserID'),
      characterId: validateStringField(item.CharacterID, 'CharacterID'),
      lastInteractionAt: readTimestamp(item, 'LastInteractionAt'),
      affectionLevel: typeof item.AffectionLevel === 'number' ? item.AffectionLevel : 0,
      createdAt: readTimestamp(item, 'CreatedAt'),
      updatedAt: readTimestamp(item, 'UpdatedAt'),
    };
  }
}
