import crypto from 'node:crypto';
import type { PushSubscription } from '@nagiyu/common';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DeleteCommand, PutCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { createRepositoryFactory } from '@nagiyu/aws';

const ERROR_MESSAGES = {
  DYNAMODB_PARAMS_REQUIRED: 'DynamoDB 実装には docClient と tableName が必要です',
} as const;

const SUBSCRIPTION_PREFIX = 'SUBSCRIPTION#';
const USER_PREFIX = 'USER#';
const ENDPOINT_PREFIX = 'ENDPOINT#';
const SUBSCRIPTION_TYPE = 'Subscription';
const ENDPOINT_INDEX_NAME = 'EndpointIndex';

export type PushSubscriptionRecord = {
  subscriptionId: string;
  userId: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type SavePushSubscriptionInput = {
  userId: string;
  subscription: PushSubscription;
};

export interface PushSubscriptionRepository {
  save(input: SavePushSubscriptionInput): Promise<PushSubscriptionRecord>;
  findAll(): Promise<PushSubscriptionRecord[]>;
  deleteByEndpoint(endpoint: string): Promise<number>;
}

type PushSubscriptionItem = {
  PK: string;
  SK: string;
  Type: string;
  GSI1PK: string;
  GSI1SK: string;
  GSI2PK: string;
  subscriptionId: string;
  userId: string;
  endpoint: string;
  p256dhKey: string;
  authKey: string;
  createdAt: string;
  updatedAt: string;
};

export class DynamoDBPushSubscriptionRepository implements PushSubscriptionRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
  }

  public async save(input: SavePushSubscriptionInput): Promise<PushSubscriptionRecord> {
    const subscriptionId = crypto.randomUUID();
    const now = new Date().toISOString();
    const item: PushSubscriptionItem = {
      PK: `${SUBSCRIPTION_PREFIX}${subscriptionId}`,
      SK: `${SUBSCRIPTION_PREFIX}${subscriptionId}`,
      Type: SUBSCRIPTION_TYPE,
      GSI1PK: `${USER_PREFIX}${input.userId}`,
      GSI1SK: `${SUBSCRIPTION_PREFIX}${subscriptionId}`,
      GSI2PK: `${ENDPOINT_PREFIX}${hashEndpoint(input.subscription.endpoint)}`,
      subscriptionId,
      userId: input.userId,
      endpoint: input.subscription.endpoint,
      p256dhKey: input.subscription.keys.p256dh,
      authKey: input.subscription.keys.auth,
      createdAt: now,
      updatedAt: now,
    };

    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
      })
    );

    return this.toRecord(item);
  }

  public async findAll(): Promise<PushSubscriptionRecord[]> {
    const result = await this.docClient.send(
      new ScanCommand({
        TableName: this.tableName,
        FilterExpression: '#type = :type',
        ExpressionAttributeNames: {
          '#type': 'Type',
        },
        ExpressionAttributeValues: {
          ':type': SUBSCRIPTION_TYPE,
        },
      })
    );

    const items = (result.Items ?? []) as PushSubscriptionItem[];
    return items.map((item) => this.toRecord(item));
  }

  public async deleteByEndpoint(endpoint: string): Promise<number> {
    const endpointHash = hashEndpoint(endpoint);
    const queryResult = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: ENDPOINT_INDEX_NAME,
        KeyConditionExpression: 'GSI2PK = :gsi2pk',
        ExpressionAttributeValues: {
          ':gsi2pk': `${ENDPOINT_PREFIX}${endpointHash}`,
        },
      })
    );

    const items = (queryResult.Items ?? []) as PushSubscriptionItem[];
    if (items.length === 0) {
      return 0;
    }

    await Promise.all(
      items.map((item) =>
        this.docClient.send(
          new DeleteCommand({
            TableName: this.tableName,
            Key: {
              PK: item.PK,
              SK: item.SK,
            },
          })
        )
      )
    );

    return items.length;
  }

  private toRecord(item: PushSubscriptionItem): PushSubscriptionRecord {
    return {
      subscriptionId: item.subscriptionId,
      userId: item.userId,
      endpoint: item.endpoint,
      keys: {
        p256dh: item.p256dhKey,
        auth: item.authKey,
      },
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}

class InMemoryPushSubscriptionRepository implements PushSubscriptionRepository {
  private readonly records = new Map<string, PushSubscriptionRecord>();

  public async save(input: SavePushSubscriptionInput): Promise<PushSubscriptionRecord> {
    const subscriptionId = crypto.randomUUID();
    const now = new Date().toISOString();
    const record: PushSubscriptionRecord = {
      subscriptionId,
      userId: input.userId,
      endpoint: input.subscription.endpoint,
      keys: {
        p256dh: input.subscription.keys.p256dh,
        auth: input.subscription.keys.auth,
      },
      createdAt: now,
      updatedAt: now,
    };

    this.records.set(subscriptionId, record);
    return record;
  }

  public async findAll(): Promise<PushSubscriptionRecord[]> {
    return Array.from(this.records.values());
  }

  public async deleteByEndpoint(endpoint: string): Promise<number> {
    let deletedCount = 0;
    for (const [subscriptionId, record] of this.records.entries()) {
      if (record.endpoint === endpoint) {
        this.records.delete(subscriptionId);
        deletedCount += 1;
      }
    }

    return deletedCount;
  }
}

function requireDynamoParams(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): { docClient: DynamoDBDocumentClient; tableName: string } {
  if (!docClient || !tableName) {
    throw new Error(ERROR_MESSAGES.DYNAMODB_PARAMS_REQUIRED);
  }

  return { docClient, tableName };
}

function hashEndpoint(endpoint: string): string {
  return crypto.createHash('sha256').update(endpoint).digest('hex');
}

const pushSubscriptionRepositoryFactory = createRepositoryFactory<
  PushSubscriptionRepository,
  [DynamoDBDocumentClient | undefined, string | undefined]
>({
  createInMemoryRepository: () => new InMemoryPushSubscriptionRepository(),
  createDynamoDBRepository: (docClient, tableName) => {
    const params = requireDynamoParams(docClient, tableName);
    return new DynamoDBPushSubscriptionRepository(params.docClient, params.tableName);
  },
});

export function createPushSubscriptionRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): PushSubscriptionRepository {
  return pushSubscriptionRepositoryFactory.createRepository(docClient, tableName);
}

export function resetPushSubscriptionRepository(): void {
  pushSubscriptionRepositoryFactory.resetRepository();
}
