import { createSubscriptionId, logger } from '@nagiyu/common';
import type { PushSubscription } from '@nagiyu/common';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  DynamoDBEntityStore,
  InMemoryEntityStore,
  InMemorySingleTableStore,
  queryAllItems,
  registerDynamoRepositories,
  scanAllItems,
  type DynamoDBAttributes,
  type EntityStore,
} from '@nagiyu/aws';
import {
  ENDPOINT_INDEX_NAME,
  PushSubscriptionMapper,
  SUBSCRIPTION_ENTITY_TYPE,
  buildEndpointGsi2Pk,
  type PushSubscriptionKey,
  type UnreadableSubscriptionItem,
} from './subscription-mapper.js';
import type { PushSubscriptionRecord } from './subscription-types.js';

export type { PushSubscriptionRecord } from './subscription-types.js';

const ERROR_MESSAGES = {
  UNREADABLE_SUBSCRIPTIONS: '読めない Web Push 購読を除外して続行します',
} as const;

/** ログに出す読めなかった Item の最大件数。多数壊れていてもログを肥大させない */
const MAX_LOGGED_UNREADABLE = 10;

/** InMemory のページ走査で 1 回に読む件数。ストアの既定に依存しないよう明示する */
const IN_MEMORY_PAGE_SIZE = 100;

export type SavePushSubscriptionInput = {
  userId: string;
  subscription: PushSubscription;
};

export interface PushSubscriptionRepository {
  /** 同じ endpoint の購読は subscriptionId が同じになり、上書きされる */
  save(input: SavePushSubscriptionInput): Promise<PushSubscriptionRecord>;
  /**
   * 読める購読をすべて返す。読めないアイテムは通知の配信全体を止めないよう除外し、
   * 件数と理由をエラーログに出す。
   */
  findAll(): Promise<PushSubscriptionRecord[]>;
  /** 消した件数を返す */
  deleteByEndpoint(endpoint: string): Promise<number>;
}

async function buildRecord(input: SavePushSubscriptionInput): Promise<PushSubscriptionRecord> {
  const now = Date.now();
  return {
    subscriptionId: await createSubscriptionId(input.subscription.endpoint),
    userId: input.userId,
    subscription: input.subscription,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 読めなかった Item を握りつぶさずに記録する。
 * 件数は全件、内訳は先頭の一部だけを出す。
 */
function logUnreadable(unreadable: UnreadableSubscriptionItem[]): void {
  if (unreadable.length === 0) {
    return;
  }
  logger.error(ERROR_MESSAGES.UNREADABLE_SUBSCRIPTIONS, {
    unreadableCount: unreadable.length,
    unreadable: unreadable.slice(0, MAX_LOGGED_UNREADABLE),
  });
}

export class DynamoDBPushSubscriptionRepository implements PushSubscriptionRepository {
  private readonly mapper = new PushSubscriptionMapper();
  private readonly entityStore: EntityStore<PushSubscriptionRecord, PushSubscriptionKey>;

  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.entityStore = new DynamoDBEntityStore(docClient, tableName, this.mapper);
  }

  public async save(input: SavePushSubscriptionInput): Promise<PushSubscriptionRecord> {
    return this.entityStore.put(await buildRecord(input));
  }

  public async findAll(): Promise<PushSubscriptionRecord[]> {
    const items = await scanAllItems(this.docClient, {
      TableName: this.tableName,
      FilterExpression: '#type = :type',
      ExpressionAttributeNames: { '#type': 'Type' },
      ExpressionAttributeValues: { ':type': SUBSCRIPTION_ENTITY_TYPE },
    });

    const { records, unreadable } = this.mapper.splitReadable(items);
    logUnreadable(unreadable);
    return records;
  }

  public async deleteByEndpoint(endpoint: string): Promise<number> {
    const items = await queryAllItems(this.docClient, {
      TableName: this.tableName,
      IndexName: ENDPOINT_INDEX_NAME,
      KeyConditionExpression: 'GSI2PK = :gsi2pk',
      ExpressionAttributeValues: { ':gsi2pk': buildEndpointGsi2Pk(endpoint) },
    });

    await Promise.all(
      items.map((item) => this.entityStore.deleteIfExists(this.mapper.keyFromItem(item)))
    );
    return items.length;
  }
}

/**
 * テスト用の InMemory 実装。
 * GSI は全件走査とフィルタで近似するため、実 DynamoDB と完全には等価でない。
 */
export class InMemoryPushSubscriptionRepository implements PushSubscriptionRepository {
  private readonly mapper = new PushSubscriptionMapper();
  private readonly entityStore: EntityStore<PushSubscriptionRecord, PushSubscriptionKey>;

  private readonly store: InMemorySingleTableStore;

  constructor(store: InMemorySingleTableStore = new InMemorySingleTableStore()) {
    this.store = store;
    this.entityStore = new InMemoryEntityStore(store, this.mapper);
  }

  public async save(input: SavePushSubscriptionInput): Promise<PushSubscriptionRecord> {
    return this.entityStore.put(await buildRecord(input));
  }

  public async findAll(): Promise<PushSubscriptionRecord[]> {
    const items: DynamoDBAttributes[] = [];
    let cursor: string | undefined;
    do {
      const page = this.store.scan({ limit: IN_MEMORY_PAGE_SIZE, cursor });
      items.push(...page.items.filter((item) => item.Type === SUBSCRIPTION_ENTITY_TYPE));
      cursor = page.nextCursor;
    } while (cursor);

    const { records, unreadable } = this.mapper.splitReadable(items);
    logUnreadable(unreadable);
    return records;
  }

  public async deleteByEndpoint(endpoint: string): Promise<number> {
    const gsi2Pk = buildEndpointGsi2Pk(endpoint);
    const items: DynamoDBAttributes[] = [];
    let cursor: string | undefined;
    do {
      const page = this.store.queryByAttribute(
        { attributeName: 'GSI2PK', attributeValue: gsi2Pk, gsiSortKeyAttributeName: 'GSI1SK' },
        { limit: IN_MEMORY_PAGE_SIZE, cursor }
      );
      items.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);

    await Promise.all(
      items.map((item) => this.entityStore.deleteIfExists(this.mapper.keyFromItem(item)))
    );
    return items.length;
  }
}

const pushSubscriptionRegistry = registerDynamoRepositories<{
  pushSubscription: PushSubscriptionRepository;
}>({
  pushSubscription: {
    createInMemoryRepository: () => new InMemoryPushSubscriptionRepository(),
    createDynamoDBRepository: ({ docClient, tableName }) =>
      new DynamoDBPushSubscriptionRepository(docClient, tableName),
  },
});

export function createPushSubscriptionRepository(
  docClient?: DynamoDBDocumentClient,
  tableName?: string
): PushSubscriptionRepository {
  return pushSubscriptionRegistry.pushSubscription.createRepository(docClient, tableName);
}

export function resetPushSubscriptionRepository(): void {
  pushSubscriptionRegistry.pushSubscription.resetRepository();
}
