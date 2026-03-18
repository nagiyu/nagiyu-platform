import { describe, it, expect, beforeEach } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
  QueryCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  createPushSubscriptionRepository,
  DynamoDBPushSubscriptionRepository,
  resetPushSubscriptionRepository,
} from '../../../src/notify/subscription-repository.js';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('DynamoDBPushSubscriptionRepository', () => {
  const tableName = 'test-admin-table';
  let repository: DynamoDBPushSubscriptionRepository;

  beforeEach(() => {
    ddbMock.reset();
    const docClient = ddbMock as unknown as DynamoDBDocumentClient;
    repository = new DynamoDBPushSubscriptionRepository(docClient, tableName);
  });

  it('サブスクリプションを保存できる', async () => {
    ddbMock.on(PutCommand).resolves({});

    const result = await repository.save({
      userId: 'admin-user-1',
      subscription: {
        endpoint: 'https://example.com/endpoint',
        keys: {
          p256dh: 'p256dh-key',
          auth: 'auth-key',
        },
      },
    });

    expect(result.userId).toBe('admin-user-1');
    expect(result.endpoint).toBe('https://example.com/endpoint');
    expect(result.keys.p256dh).toBe('p256dh-key');
    expect(result.subscriptionId).toBeTruthy();
  });

  it('endpoint が空文字の場合は保存時にエラーを投げる', async () => {
    await expect(
      repository.save({
        userId: 'admin-user-1',
        subscription: {
          endpoint: '',
          keys: {
            p256dh: 'p256dh-key',
            auth: 'auth-key',
          },
        },
      })
    ).rejects.toThrow('endpoint は空文字にできません');
  });

  it('全サブスクリプションを取得できる', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        {
          PK: 'SUBSCRIPTION#sub-1',
          SK: 'SUBSCRIPTION#sub-1',
          Type: 'Subscription',
          GSI1PK: 'USER#admin-user-1',
          GSI1SK: 'SUBSCRIPTION#sub-1',
          GSI2PK: 'ENDPOINT#hash-1',
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
    expect(result[0].subscriptionId).toBe('sub-1');
    expect(result[0].keys.auth).toBe('auth-1');
  });

  it('endpointでサブスクリプションを削除できる', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          PK: 'SUBSCRIPTION#sub-1',
          SK: 'SUBSCRIPTION#sub-1',
          GSI2PK: 'ENDPOINT#hash-1',
        },
      ],
    });
    ddbMock.on(DeleteCommand).resolves({});

    const deletedCount = await repository.deleteByEndpoint('https://example.com/endpoint-1');

    expect(deletedCount).toBe(1);
  });

  it('削除対象がない場合は0件を返す', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [],
    });

    const deletedCount = await repository.deleteByEndpoint('https://example.com/not-found');

    expect(deletedCount).toBe(0);
  });

  it('endpoint が空文字の場合は削除時にエラーを投げる', async () => {
    await expect(repository.deleteByEndpoint('')).rejects.toThrow(
      'endpoint は空文字にできません'
    );
  });
});

describe('createPushSubscriptionRepository', () => {
  beforeEach(() => {
    resetPushSubscriptionRepository();
  });

  it('USE_IN_MEMORY_DB=true の場合はインメモリ実装を利用できる', async () => {
    process.env.USE_IN_MEMORY_DB = 'true';

    const repository = createPushSubscriptionRepository();
    const saved = await repository.save({
      userId: 'admin-user-2',
      subscription: {
        endpoint: 'https://example.com/in-memory',
        keys: {
          p256dh: 'memory-p256dh',
          auth: 'memory-auth',
        },
      },
    });

    const all = await repository.findAll();
    const deleted = await repository.deleteByEndpoint(saved.endpoint);

    expect(all).toHaveLength(1);
    expect(deleted).toBe(1);
  });

  it('DynamoDB 実装時に必須引数が不足するとエラーを投げる', () => {
    process.env.USE_IN_MEMORY_DB = 'false';

    expect(() => createPushSubscriptionRepository()).toThrow(
      'DynamoDB 実装には docClient と tableName が必要です'
    );
  });
});
