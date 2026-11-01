import { type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBEntityStore, queryAllItems, toDatabaseError, type EntityStore } from '@nagiyu/aws';
import type {
  CreatePushSubscriptionInput,
  PushSubscriptionEntity,
  PushSubscriptionKey,
} from '../entities/push-subscription.entity.js';
import { PushSubscriptionMapper } from '../mappers/push-subscription.mapper.js';
import { buildPushSubscriptionSKPrefix, buildUserPK } from '../mappers/keys.js';
import type { PushSubscriptionRepository } from './push-subscription.repository.interface.js';

export class DynamoDBPushSubscriptionRepository implements PushSubscriptionRepository {
  private readonly mapper = new PushSubscriptionMapper();
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly entityStore: EntityStore<PushSubscriptionEntity, PushSubscriptionKey>;

  constructor(
    docClient: DynamoDBDocumentClient,
    tableName: string,
    nowMs: () => number = () => Date.now()
  ) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.entityStore = new DynamoDBEntityStore(docClient, tableName, this.mapper, { now: nowMs });
  }

  public async put(input: CreatePushSubscriptionInput): Promise<PushSubscriptionEntity> {
    return this.entityStore.put({ ...input, createdAt: undefined });
  }

  public async get(key: PushSubscriptionKey): Promise<PushSubscriptionEntity | null> {
    return this.entityStore.get(key);
  }

  /** 無効な endpoint の片付けから呼ばれるため、対象がなくても成功させる。 */
  public async delete(key: PushSubscriptionKey): Promise<void> {
    await this.entityStore.deleteIfExists(key);
  }

  public async listByUser(userId: string): Promise<PushSubscriptionEntity[]> {
    const pk = buildUserPK(userId);
    const prefix = buildPushSubscriptionSKPrefix();

    try {
      const items = await queryAllItems(this.docClient, {
        TableName: this.tableName,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
        ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
        ExpressionAttributeValues: { ':pk': pk, ':prefix': prefix },
      });
      return items.map((raw) => this.mapper.toEntity(raw));
    } catch (error) {
      throw toDatabaseError(error);
    }
  }
}
