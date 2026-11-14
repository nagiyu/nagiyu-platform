import {
  immutablePatchValue,
  readTimestamp,
  requiredPatchValue,
  validateArrayField,
  validateStringField,
  validateTimestampField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
} from '@nagiyu/aws';
import type { ExplorationEntity, ExplorationKey } from '../entities/exploration.entity.js';
import { buildExplorationSK, buildUserPK } from './keys.js';

const isString = (element: unknown): element is string => typeof element === 'string';

/**
 * `ExplorationEntity ↔ DynamoDB Item` の変換と PK/SK 組み立てを担当する Mapper。
 */
export class ExplorationMapper implements EntityMapper<ExplorationEntity, ExplorationKey> {
  public readonly entityType = 'Exploration';

  public buildKeys(key: ExplorationKey): DynamoDBKey {
    return {
      PK: buildUserPK(key.userId),
      SK: buildExplorationSK(key.characterId, key.topicId),
    };
  }

  public getKey(entity: ExplorationEntity): ExplorationKey {
    return {
      userId: entity.userId,
      characterId: entity.characterId,
      topicId: entity.topicId,
    };
  }

  public toItem(entity: ExplorationEntity): DynamoDBAttributes {
    return {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      UserID: entity.userId,
      CharacterID: entity.characterId,
      TopicID: entity.topicId,
      ExploredAt: entity.exploredAt,
      RecentAngles: entity.recentAngles,
      UpdatedAt: entity.updatedAt,
      // 他の Entity と属性構成を揃える。記録は上書きするだけで作成日時を区別しないため更新日時と同じ値にする
      CreatedAt: entity.updatedAt,
    };
  }

  public toUpdateAttributes(changes: EntityPatch<ExplorationEntity>): DynamoDBAttributes {
    return {
      UserID: immutablePatchValue(changes.userId, 'UserID'),
      CharacterID: immutablePatchValue(changes.characterId, 'CharacterID'),
      TopicID: immutablePatchValue(changes.topicId, 'TopicID'),
      ExploredAt: requiredPatchValue(changes.exploredAt, 'ExploredAt'),
      RecentAngles: requiredPatchValue(changes.recentAngles, 'RecentAngles'),
    };
  }

  public toEntity(item: DynamoDBAttributes): ExplorationEntity {
    return {
      userId: validateStringField(item.UserID, 'UserID'),
      characterId: validateStringField(item.CharacterID, 'CharacterID'),
      topicId: validateStringField(item.TopicID, 'TopicID'),
      exploredAt: validateTimestampField(item.ExploredAt, 'ExploredAt'),
      recentAngles: validateArrayField(item.RecentAngles, 'RecentAngles', {
        isElement: isString,
      }),
      updatedAt: readTimestamp(item, 'UpdatedAt'),
    };
  }
}
