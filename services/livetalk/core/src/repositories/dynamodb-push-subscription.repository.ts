import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DatabaseError, type DynamoDBItem } from '@nagiyu/aws';
import type {
  CreatePushSubscriptionInput,
  PushSubscriptionEntity,
  PushSubscriptionKey,
} from '../entities/push-subscription.entity.js';
import { PushSubscriptionMapper } from '../mappers/push-subscription.mapper.js';
import { buildPushSubscriptionSK, buildPushSubscriptionSKPrefix, buildUserPK } from '../mappers/keys.js';
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
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }

  public async listByUser(userId: string): Promise<PushSubscriptionEntity[]> {
    const pk = buildUserPK(userId);
    const prefix = buildPushSubscriptionSKPrefix();
    const results: PushSubscriptionEntity[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    for (;;) {
      let result;
      try {
        result = await this.docClient.send(
          new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
            ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
            ExpressionAttributeValues: { ':pk': pk, ':prefix': prefix },
            ExclusiveStartKey: exclusiveStartKey,
          })
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new DatabaseError(message, error instanceof Error ? error : undefined);
      }

      for (const raw of result.Items ?? []) {
        results.push(this.mapper.toEntity(raw as unknown as DynamoDBItem));
      }

      if (!result.LastEvaluatedKey) break;
      exclusiveStartKey = result.LastEvaluatedKey;
    }

    return results;
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
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
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
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(message, error instanceof Error ? error : undefined);
    }
  }
}
