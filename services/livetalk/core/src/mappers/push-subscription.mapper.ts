import {
  immutablePatchValue,
  readTimestamp,
  requiredPatchValue,
  validateStringField,
  type DynamoDBAttributes,
  type DynamoDBKey,
  type EntityMapper,
  type EntityPatch,
} from '@nagiyu/aws';
import type {
  PushSubscriptionEntity,
  PushSubscriptionKey,
} from '../entities/push-subscription.entity.js';
import { buildPushSubscriptionSK, buildUserPK } from './keys.js';

export class PushSubscriptionMapper implements EntityMapper<
  PushSubscriptionEntity,
  PushSubscriptionKey
> {
  public readonly entityType = 'PushSubscription';

  public buildKeys(key: PushSubscriptionKey): DynamoDBKey {
    return { PK: buildUserPK(key.userId), SK: buildPushSubscriptionSK(key.subscriptionId) };
  }

  public getKey(entity: PushSubscriptionEntity): PushSubscriptionKey {
    return { userId: entity.userId, subscriptionId: entity.subscriptionId };
  }

  public toItem(entity: PushSubscriptionEntity): DynamoDBAttributes {
    return {
      ...this.buildKeys(this.getKey(entity)),
      Type: this.entityType,
      UserID: entity.userId,
      SubscriptionID: entity.subscriptionId,
      Endpoint: entity.endpoint,
      P256dhKey: entity.p256dhKey,
      AuthKey: entity.authKey,
      CreatedAt: entity.createdAt,
      UpdatedAt: entity.updatedAt,
    };
  }

  public toUpdateAttributes(changes: EntityPatch<PushSubscriptionEntity>): DynamoDBAttributes {
    return {
      UserID: immutablePatchValue(changes.userId, 'UserID'),
      SubscriptionID: immutablePatchValue(changes.subscriptionId, 'SubscriptionID'),
      CreatedAt: immutablePatchValue(changes.createdAt, 'CreatedAt'),
      Endpoint: requiredPatchValue(changes.endpoint, 'Endpoint'),
      P256dhKey: requiredPatchValue(changes.p256dhKey, 'P256dhKey'),
      AuthKey: requiredPatchValue(changes.authKey, 'AuthKey'),
    };
  }

  public toEntity(item: DynamoDBAttributes): PushSubscriptionEntity {
    return {
      userId: validateStringField(item.UserID, 'UserID'),
      subscriptionId: validateStringField(item.SubscriptionID, 'SubscriptionID'),
      endpoint: validateStringField(item.Endpoint, 'Endpoint'),
      p256dhKey: validateStringField(item.P256dhKey, 'P256dhKey'),
      authKey: validateStringField(item.AuthKey, 'AuthKey'),
      createdAt: readTimestamp(item, 'CreatedAt'),
      updatedAt: readTimestamp(item, 'UpdatedAt'),
    };
  }
}
