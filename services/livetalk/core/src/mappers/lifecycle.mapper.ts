import {
  immutablePatchValue,
  InvalidEntityDataError,
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
  LifecycleEntity,
  LifecycleKey,
  UserActivityProfile,
} from '../entities/lifecycle.entity.js';
import { buildLifecycleSK, buildUserPK } from './keys.js';

const ERROR_MESSAGES = {
  INVALID_USER_ACTIVITY_PROFILE: 'UserActivityProfile が不正です',
} as const;

function toUserActivityProfile(raw: unknown): UserActivityProfile {
  if (typeof raw !== 'object' || raw === null) {
    throw new InvalidEntityDataError(ERROR_MESSAGES.INVALID_USER_ACTIVITY_PROFILE);
  }
  const obj = raw as Record<string, unknown>;
  return {
    morningPeak: validateStringField(obj['morningPeak'], 'UserActivityProfile.morningPeak'),
    eveningPeak: validateStringField(obj['eveningPeak'], 'UserActivityProfile.eveningPeak'),
    sampleSize: typeof obj['sampleSize'] === 'number' ? obj['sampleSize'] : 0,
    lastLearnedAt: validateStringField(obj['lastLearnedAt'], 'UserActivityProfile.lastLearnedAt'),
  };
}

export class LifecycleMapper implements EntityMapper<LifecycleEntity, LifecycleKey> {
  public readonly entityType = 'Lifecycle';

  public buildKeys(key: LifecycleKey): DynamoDBKey {
    return { PK: buildUserPK(key.userId), SK: buildLifecycleSK(key.characterId) };
  }

  public getKey(entity: LifecycleEntity): LifecycleKey {
    return { userId: entity.userId, characterId: entity.characterId };
  }

  public toItem(entity: LifecycleEntity): DynamoDBAttributes {
    return {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      UserID: entity.userId,
      CharacterID: entity.characterId,
      Bedtime: entity.bedtime,
      WakeUpTime: entity.wakeUpTime,
      ...(entity.userActivityProfile !== undefined && {
        UserActivityProfile: entity.userActivityProfile,
      }),
      CreatedAt: entity.createdAt,
      UpdatedAt: entity.updatedAt,
    };
  }

  public toUpdateAttributes(changes: EntityPatch<LifecycleEntity>): DynamoDBAttributes {
    return {
      UserID: immutablePatchValue(changes.userId, 'UserID'),
      CharacterID: immutablePatchValue(changes.characterId, 'CharacterID'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      Bedtime: requiredPatchValue(changes.bedtime, 'Bedtime'),
      WakeUpTime: requiredPatchValue(changes.wakeUpTime, 'WakeUpTime'),
      UserActivityProfile: optionalPatchValue(changes.userActivityProfile),
    };
  }

  public toEntity(item: DynamoDBAttributes): LifecycleEntity {
    return {
      userId: validateStringField(item.UserID, 'UserID'),
      characterId: validateStringField(item.CharacterID, 'CharacterID'),
      bedtime: validateStringField(item.Bedtime, 'Bedtime'),
      wakeUpTime: validateStringField(item.WakeUpTime, 'WakeUpTime'),
      ...(item.UserActivityProfile !== undefined && {
        userActivityProfile: toUserActivityProfile(item.UserActivityProfile),
      }),
      createdAt: readTimestamp(item, 'CreatedAt'),
      updatedAt: readTimestamp(item, 'UpdatedAt'),
    };
  }
}
