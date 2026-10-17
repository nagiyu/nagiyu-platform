import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
  QueryCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { InMemorySingleTableStore } from '@nagiyu/aws';
import { logger } from '@nagiyu/common';
import {
  createPushSubscriptionRepository,
  DynamoDBPushSubscriptionRepository,
  InMemoryPushSubscriptionRepository,
  resetPushSubscriptionRepository,
} from '../../../src/notify/subscription-repository.js';

const ddbMock = mockClient(DynamoDBDocumentClient);

function buildInput(endpoint: string) {
  return {
    userId: 'admin-user-1',
    subscription: {
      endpoint,
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    },
  };
}

function buildItem(id: string, overrides: Record<string, unknown> = {}) {
  return {
    PK: `SUBSCRIPTION#${id}`,
    SK: `SUBSCRIPTION#${id}`,
    Type: 'Subscription',
    GSI1PK: 'USER#admin-user-1',
    GSI1SK: `SUBSCRIPTION#${id}`,
    GSI2PK: `ENDPOINT#hash-${id}`,
    SubscriptionID: id,
    UserID: 'admin-user-1',
    Endpoint: `https://example.com/${id}`,
    P256dhKey: `p256dh-${id}`,
    AuthKey: `auth-${id}`,
    CreatedAt: 1767225600000,
    UpdatedAt: 1767225600000,
    ...overrides,
  };
}

describe('DynamoDBPushSubscriptionRepository', () => {
  const tableName = 'test-admin-table';
  let repository: DynamoDBPushSubscriptionRepository;

  beforeEach(() => {
    ddbMock.reset();
    const docClient = ddbMock as unknown as DynamoDBDocumentClient;
    repository = new DynamoDBPushSubscriptionRepository(docClient, tableName);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('サブスクリプションを PascalCase の属性・ミリ秒の時刻で保存する', async () => {
    ddbMock.on(PutCommand).resolves({});

    const result = await repository.save(buildInput('https://example.com/endpoint'));

    expect(result.userId).toBe('admin-user-1');
    expect(result.subscription.endpoint).toBe('https://example.com/endpoint');
    expect(result.subscription.keys.p256dh).toBe('p256dh-key');
    expect(result.subscriptionId).toMatch(/^sub_[0-9a-f]{32}$/);
    expect(typeof result.createdAt).toBe('number');
    expect(result.updatedAt).toBeGreaterThanOrEqual(result.createdAt);

    const item = ddbMock.commandCalls(PutCommand)[0].args[0].input.Item;
    expect(item).toMatchObject({
      Type: 'Subscription',
      SubscriptionID: result.subscriptionId,
      UserID: 'admin-user-1',
      Endpoint: 'https://example.com/endpoint',
      P256dhKey: 'p256dh-key',
      AuthKey: 'auth-key',
    });
    expect(item).not.toHaveProperty('subscriptionId');
    expect(item).not.toHaveProperty('createdAt');
  });

  it('同じ endpoint で保存し直すと同じ subscriptionId になり、同じ PK を上書きする', async () => {
    ddbMock.on(PutCommand).resolves({});
    const input = buildInput('https://example.com/same-endpoint');

    const first = await repository.save(input);
    const second = await repository.save(input);

    expect(second.subscriptionId).toBe(first.subscriptionId);
    const puts = ddbMock.commandCalls(PutCommand);
    expect(puts[0].args[0].input.Item?.PK).toBe(puts[1].args[0].input.Item?.PK);
  });

  it('endpoint が空文字の場合は保存時にエラーを投げる', async () => {
    await expect(repository.save(buildInput(''))).rejects.toThrow('endpoint は空文字にできません');
  });

  it('全サブスクリプションを全ページ取得する', async () => {
    ddbMock
      .on(ScanCommand)
      .resolvesOnce({
        Items: [buildItem('sub-1')],
        LastEvaluatedKey: { PK: 'SUBSCRIPTION#sub-1', SK: 'SUBSCRIPTION#sub-1' },
      })
      .resolvesOnce({ Items: [buildItem('sub-2')] });

    const result = await repository.findAll();

    expect(result.map((r) => r.subscriptionId)).toEqual(['sub-1', 'sub-2']);
    const scans = ddbMock.commandCalls(ScanCommand);
    expect(scans).toHaveLength(2);
    expect(scans[0].args[0].input.ExpressionAttributeValues).toEqual({ ':type': 'Subscription' });
    expect(scans[1].args[0].input.ExclusiveStartKey).toEqual({
      PK: 'SUBSCRIPTION#sub-1',
      SK: 'SUBSCRIPTION#sub-1',
    });
  });

  it('旧形式のアイテムも読める', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        {
          PK: 'SUBSCRIPTION#sub-1',
          SK: 'SUBSCRIPTION#sub-1',
          Type: 'Subscription',
          subscriptionId: 'sub-1',
          userId: 'admin-user-1',
          endpoint: 'https://example.com/endpoint-1',
          p256dhKey: 'p256dh-1',
          authKey: 'auth-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    const result = await repository.findAll();

    expect(result).toHaveLength(1);
    expect(result[0].subscription.keys.auth).toBe('auth-1');
    expect(result[0].createdAt).toBe(Date.parse('2026-01-01T00:00:00.000Z'));
  });

  it('読めないアイテムは除外し、件数と理由をエラーログに出す', async () => {
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    ddbMock.on(ScanCommand).resolves({
      Items: [buildItem('sub-1'), buildItem('broken', { AuthKey: undefined })],
    });

    const result = await repository.findAll();

    expect(result.map((r) => r.subscriptionId)).toEqual(['sub-1']);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const context = errorSpy.mock.calls[0][1] as {
      unreadableCount: number;
      unreadable: Array<{ pk: string; reason: string }>;
    };
    expect(context.unreadableCount).toBe(1);
    expect(context.unreadable[0].pk).toBe('SUBSCRIPTION#broken');
    expect(context.unreadable[0].reason).toContain('AuthKey');
  });

  it('読めないアイテムがなければエラーログを出さない', async () => {
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    ddbMock.on(ScanCommand).resolves({ Items: [buildItem('sub-1')] });

    await repository.findAll();

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('endpoint でサブスクリプションを削除し、消した件数を返す', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [{ PK: 'SUBSCRIPTION#sub-1', SK: 'SUBSCRIPTION#sub-1', GSI2PK: 'ENDPOINT#hash-1' }],
    });
    ddbMock.on(DeleteCommand).resolves({});

    const deletedCount = await repository.deleteByEndpoint('https://example.com/endpoint-1');

    expect(deletedCount).toBe(1);
    expect(ddbMock.commandCalls(QueryCommand)[0].args[0].input.IndexName).toBe('EndpointIndex');
    const deletes = ddbMock.commandCalls(DeleteCommand);
    expect(deletes).toHaveLength(1);
    expect(deletes[0].args[0].input.Key).toEqual({
      PK: 'SUBSCRIPTION#sub-1',
      SK: 'SUBSCRIPTION#sub-1',
    });
  });

  it('削除対象がない場合は0件を返す', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const deletedCount = await repository.deleteByEndpoint('https://example.com/not-found');

    expect(deletedCount).toBe(0);
    expect(ddbMock.commandCalls(DeleteCommand)).toHaveLength(0);
  });

  it('endpoint が空文字の場合は削除時にエラーを投げる', async () => {
    await expect(repository.deleteByEndpoint('')).rejects.toThrow('endpoint は空文字にできません');
  });
});

describe('InMemoryPushSubscriptionRepository', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('100 件を超える購読もすべて返す', async () => {
    const repository = new InMemoryPushSubscriptionRepository();
    for (let i = 0; i < 130; i++) {
      await repository.save(buildInput(`https://example.com/${i}`));
    }

    expect(await repository.findAll()).toHaveLength(130);
  });

  it('読めないアイテムは除外してエラーログに出す', async () => {
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    const store = new InMemorySingleTableStore();
    const repository = new InMemoryPushSubscriptionRepository(store);
    await repository.save(buildInput('https://example.com/ok'));
    store.put({ PK: 'SUBSCRIPTION#broken', SK: 'SUBSCRIPTION#broken', Type: 'Subscription' });

    expect(await repository.findAll()).toHaveLength(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});

describe('createPushSubscriptionRepository', () => {
  beforeEach(() => {
    resetPushSubscriptionRepository();
    delete process.env.USE_IN_MEMORY_DB;
    delete process.env.DYNAMODB_TABLE_NAME;
  });

  it('USE_IN_MEMORY_DB=true の場合はインメモリ実装を利用できる', async () => {
    process.env.USE_IN_MEMORY_DB = 'true';

    const repository = createPushSubscriptionRepository();
    const saved = await repository.save(buildInput('https://example.com/in-memory'));

    const all = await repository.findAll();
    const deleted = await repository.deleteByEndpoint(saved.subscription.endpoint);

    expect(all).toHaveLength(1);
    expect(deleted).toBe(1);
    expect(await repository.findAll()).toHaveLength(0);
  });

  it('インメモリ実装でも同じ endpoint の再登録は 1 件のまま上書きされる', async () => {
    process.env.USE_IN_MEMORY_DB = 'true';

    const repository = createPushSubscriptionRepository();
    const input = buildInput('https://example.com/in-memory-same');
    const first = await repository.save(input);
    const second = await repository.save(input);

    expect(second.subscriptionId).toBe(first.subscriptionId);
    expect(await repository.findAll()).toHaveLength(1);
  });

  it('tableName が引数・env のいずれでも未指定なら例外を投げる', () => {
    process.env.USE_IN_MEMORY_DB = 'false';

    expect(() => createPushSubscriptionRepository()).toThrow(
      '環境変数 DYNAMODB_TABLE_NAME が設定されていません'
    );
  });
});
