import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { queryAllItems, toDatabaseError, type DynamoDBItem } from '@nagiyu/aws';
import type {
  CreatePushSubscriptionInput,
  PushSubscriptionEntity,
  PushSubscriptionKey,
} from '../entities/push-subscription.entity.js';
import { PushSubscriptionMapper } from '../mappers/push-subscription.mapper.js';
import {
  buildPushSubscriptionSK,
  buildPushSubscriptionSKPrefix,
  buildUserPK,
} from '../mappers/keys.js';
import type { PushSubscriptionRepository } from './push-subscription.repository.interface.js';

export class DynamoDBPushSubscriptionRepository implements PushSubscriptionRepository {
  private readonly mapper: PushSubscriptionMapper;
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly nowMs: () => number;

  constructor(
    docClient: DynamoDBDocumentClient,
    tableName: string,
    nowMs: () => number = () => Date.now()
  ) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.nowMs = nowMs;
    this.mapper = new PushSubscriptionMapper();
  }

  public async put(input: CreatePushSubscriptionInput): Promise<PushSubscriptionEntity> {
    const now = this.nowMs();
    const entity: PushSubscriptionEntity = { ...input, CreatedAt: now, UpdatedAt: now };
    try {
      await this.docClient.send(
        new PutCommand({ TableName: this.tableName, Item: this.mapper.toItem(entity) })
      );
      return entity;
    } catch (error) {
      throw toDatabaseError(error);
    }
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

  public async get(key: PushSubscriptionKey): Promise<PushSubscriptionEntity | null> {
    const pk = buildUserPK(key.userId);
    const sk = buildPushSubscriptionSK(key.subscriptionId);
    try {
      const result = await this.docClient.send(
        new GetCommand({ TableName: this.tableName, Key: { PK: pk, SK: sk } })
      );
      if (!result.Item) return null;
      return this.mapper.toEntity(result.Item as unknown as DynamoDBItem);
    } catch (error) {
      throw toDatabaseError(error);
    }
  }

  public async delete(key: PushSubscriptionKey): Promise<void> {
    const pk = buildUserPK(key.userId);
    const sk = buildPushSubscriptionSK(key.subscriptionId);
    try {
      await this.docClient.send(
        new DeleteCommand({ TableName: this.tableName, Key: { PK: pk, SK: sk } })
      );
    } catch (error) {
      throw toDatabaseError(error);
    }
  }
}
