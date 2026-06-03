import {
  validateStringField,
  validateTimestampField,
  type DynamoDBItem,
  type EntityMapper,
} from '@nagiyu/aws';
import type {
  LifecycleEntity,
  LifecycleKey,
  UserActivityProfile,
} from '../entities/lifecycle.entity.js';
import { buildLifecycleSK, buildUserPK } from './keys.js';

function toUserActivityProfile(raw: unknown): UserActivityProfile {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('UserActivityProfile が不正です');
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

  public toItem(entity: LifecycleEntity): DynamoDBItem {
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
      Bedtime: entity.Bedtime,
      WakeUpTime: entity.WakeUpTime,
      ...(entity.UserActivityProfile !== undefined && {
        UserActivityProfile: entity.UserActivityProfile,
      }),
      CreatedAt: entity.CreatedAt,
      UpdatedAt: entity.UpdatedAt,
    };
  }

  public toEntity(item: DynamoDBItem): LifecycleEntity {
    return {
      UserID: validateStringField(item.UserID, 'UserID'),
      CharacterID: validateStringField(item.CharacterID, 'CharacterID'),
      Bedtime: validateStringField(item.Bedtime, 'Bedtime'),
      WakeUpTime: validateStringField(item.WakeUpTime, 'WakeUpTime'),
      ...(item.UserActivityProfile !== undefined && {
        UserActivityProfile: toUserActivityProfile(item.UserActivityProfile),
      }),
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
      UpdatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
    };
  }

  public buildKeys(key: LifecycleKey): { pk: string; sk: string } {
    return {
      pk: buildUserPK(key.userId),
      sk: buildLifecycleSK(key.characterId),
    };
  }
}
