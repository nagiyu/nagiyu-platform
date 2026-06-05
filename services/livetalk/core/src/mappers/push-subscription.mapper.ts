import {
  validateStringField,
  validateTimestampField,
  type DynamoDBItem,
  type EntityMapper,
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

  public toItem(entity: PushSubscriptionEntity): DynamoDBItem {
    const { pk, sk } = this.buildKeys({
      userId: entity.UserID,
      subscriptionId: entity.SubscriptionID,
    });
    return {
      PK: pk,
      SK: sk,
      Type: this.entityType,
      UserID: entity.UserID,
      SubscriptionID: entity.SubscriptionID,
      Endpoint: entity.Endpoint,
      P256dhKey: entity.P256dhKey,
      AuthKey: entity.AuthKey,
      CreatedAt: entity.CreatedAt,
      UpdatedAt: entity.UpdatedAt,
    };
  }

  public toEntity(item: DynamoDBItem): PushSubscriptionEntity {
    return {
      UserID: validateStringField(item.UserID, 'UserID'),
      SubscriptionID: validateStringField(item.SubscriptionID, 'SubscriptionID'),
      Endpoint: validateStringField(item.Endpoint, 'Endpoint'),
      P256dhKey: validateStringField(item.P256dhKey, 'P256dhKey'),
      AuthKey: validateStringField(item.AuthKey, 'AuthKey'),
      CreatedAt: validateTimestampField(item.CreatedAt, 'CreatedAt'),
      UpdatedAt: validateTimestampField(item.UpdatedAt, 'UpdatedAt'),
    };
  }

  public buildKeys(key: PushSubscriptionKey): { pk: string; sk: string } {
    return {
      pk: buildUserPK(key.userId),
      sk: buildPushSubscriptionSK(key.subscriptionId),
    };
  }
}
