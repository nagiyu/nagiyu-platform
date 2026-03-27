import crypto from 'node:crypto';
import type { PushSubscription } from '@nagiyu/common';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DeleteCommand, PutCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { AbstractDynamoDBRepository, createRepositoryFactory } from '@nagiyu/aws';

const ERROR_MESSAGES = {
  DYNAMODB_PARAMS_REQUIRED: 'DynamoDB 実装には docClient と tableName が必要です',
  INVALID_ENDPOINT: 'endpoint は空文字にできません',
  INVALID_SUBSCRIPTION_ID: 'subscriptionId は空文字にできません',
  INVALID_USER_ID: 'userId は空文字にできません',
  INVALID_P256DH_KEY: 'p256dhKey は空文字にできません',
  INVALID_AUTH_KEY: 'authKey は空文字にできません',
} as const;

const SUBSCRIPTION_PREFIX = 'SUBSCRIPTION#';
const USER_PREFIX = 'USER#';
const ENDPOINT_PREFIX = 'ENDPOINT#';
const SUBSCRIPTION_TYPE = 'Subscription';
const ENDPOINT_INDEX_NAME = 'EndpointIndex';

export type PushSubscriptionRecord = {
  subscriptionId: string;
  userId: string;
  subscription: PushSubscription;
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

type SaveSubscriptionItem = Omit<PushSubscriptionItem, 'createdAt' | 'updatedAt'>;

export class DynamoDBPushSubscriptionRepository
  extends AbstractDynamoDBRepository<PushSubscriptionRecord, { subscriptionId: string }>
  implements PushSubscriptionRepository
{
  private static readonly ENTITY_TYPE = SUBSCRIPTION_TYPE;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    super(docClient, {
      tableName,
      entityType: DynamoDBPushSubscriptionRepository.ENTITY_TYPE,
    });
  }

  public async save(input: SavePushSubscriptionInput): Promise<PushSubscriptionRecord> {
    const subscriptionId = crypto.randomUUID();
    const item = this.mapToItem({
      subscriptionId,
      userId: input.userId,
      subscription: input.subscription,
    });
    const now = new Date().toISOString();
    const itemWithTimestamps: PushSubscriptionItem = {
      ...item,
      createdAt: now,
      updatedAt: now,
    };

    await this.docClient.send(
      new PutCommand({
        TableName: this.config.tableName,
        Item: itemWithTimestamps,
      })
    );

    return this.toRecord(itemWithTimestamps);
  }

  public async findAll(): Promise<PushSubscriptionRecord[]> {
    const result = await this.docClient.send(
      new ScanCommand({
        TableName: this.config.tableName,
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
        TableName: this.config.tableName,
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
            TableName: this.config.tableName,
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
      subscription: {
        endpoint: item.endpoint,
        keys: {
          p256dh: item.p256dhKey,
          auth: item.authKey,
        },
      },
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  protected buildKeys(key: { subscriptionId: string }): { PK: string; SK: string } {
    return {
      PK: `${SUBSCRIPTION_PREFIX}${key.subscriptionId}`,
      SK: `${SUBSCRIPTION_PREFIX}${key.subscriptionId}`,
    };
  }

  protected mapToEntity(item: Record<string, unknown>): PushSubscriptionRecord {
    return this.toRecord(item as PushSubscriptionItem);
  }

  protected mapToItem(
    entity: Omit<PushSubscriptionRecord, 'createdAt' | 'updatedAt'>
  ): SaveSubscriptionItem {
    if (!entity.subscriptionId) {
      throw new Error(ERROR_MESSAGES.INVALID_SUBSCRIPTION_ID);
    }
    if (!entity.userId) {
      throw new Error(ERROR_MESSAGES.INVALID_USER_ID);
    }
    if (!entity.subscription.keys.p256dh) {
      throw new Error(ERROR_MESSAGES.INVALID_P256DH_KEY);
    }
    if (!entity.subscription.keys.auth) {
      throw new Error(ERROR_MESSAGES.INVALID_AUTH_KEY);
    }

    const subscriptionId = entity.subscriptionId;
    const keys = this.buildKeys({ subscriptionId });
    return {
      ...keys,
      Type: DynamoDBPushSubscriptionRepository.ENTITY_TYPE,
      GSI1PK: `${USER_PREFIX}${entity.userId}`,
      GSI1SK: `${SUBSCRIPTION_PREFIX}${subscriptionId}`,
      GSI2PK: `${ENDPOINT_PREFIX}${hashEndpoint(entity.subscription.endpoint)}`,
      subscriptionId,
      userId: entity.userId,
      endpoint: entity.subscription.endpoint,
      p256dhKey: entity.subscription.keys.p256dh,
      authKey: entity.subscription.keys.auth,
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
      subscription: {
        endpoint: input.subscription.endpoint,
        keys: {
          p256dh: input.subscription.keys.p256dh,
          auth: input.subscription.keys.auth,
        },
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
      if (record.subscription.endpoint === endpoint) {
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

/**
 * Endpoint URL から GSI2PK 用のハッシュ値を生成する。
 *
 * DynamoDB のパーティションキー長制限を超えないように、
 * Endpoint URL は SHA-256 の固定長ハッシュへ変換して保存する。
 */
function hashEndpoint(endpoint: string): string {
  if (endpoint.length === 0) {
    throw new Error(ERROR_MESSAGES.INVALID_ENDPOINT);
  }

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
