/**
 * createErrorEventWriter の単体テスト
 */

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  createErrorEventWriter,
  resetErrorEventWriter,
} from '../../../src/error-events/factory.js';
import { DynamoDBErrorEventWriter } from '../../../src/error-events/dynamodb-writer.js';
import { InMemoryErrorEventWriter } from '../../../src/error-events/in-memory-writer.js';
import { getInMemoryErrorEventStore } from '../../../src/error-events/in-memory-store.js';
import type { ErrorEvent } from '@nagiyu/common';

const sampleEvent = (): ErrorEvent => ({
  eventId: 'evt-1',
  serviceId: 'svc',
  source: 'application',
  severity: 'error',
  title: 't',
  message: 'm',
  context: '{}',
  occurredAt: Date.parse('2026-05-06T00:00:00.000Z'),
});

describe('createErrorEventWriter', () => {
  const originalUseInMemory = process.env.USE_IN_MEMORY_DB;

  beforeEach(() => {
    resetErrorEventWriter();
  });

  afterEach(() => {
    if (originalUseInMemory === undefined) {
      delete process.env.USE_IN_MEMORY_DB;
    } else {
      process.env.USE_IN_MEMORY_DB = originalUseInMemory;
    }
    resetErrorEventWriter();
  });

  it('USE_IN_MEMORY_DB=true のとき in-memory 実装を返す', () => {
    process.env.USE_IN_MEMORY_DB = 'true';

    const writer = createErrorEventWriter();

    expect(writer).toBeInstanceOf(InMemoryErrorEventWriter);
  });

  it('USE_IN_MEMORY_DB が未設定で docClient と tableName が揃っているとき DynamoDB 実装を返す', () => {
    delete process.env.USE_IN_MEMORY_DB;
    const mockClient = { send: jest.fn() } as unknown as DynamoDBDocumentClient;

    const writer = createErrorEventWriter(mockClient, 'tbl');

    expect(writer).toBeInstanceOf(DynamoDBErrorEventWriter);
  });

  it('USE_IN_MEMORY_DB が未設定で tableName が引数・env のどちらにもないときは例外を投げる', () => {
    delete process.env.USE_IN_MEMORY_DB;
    delete process.env.DYNAMODB_TABLE_NAME;
    const mockClient = { send: jest.fn() } as unknown as DynamoDBDocumentClient;
    expect(() => createErrorEventWriter(mockClient, undefined)).toThrow(
      '環境変数 DYNAMODB_TABLE_NAME が設定されていません'
    );
  });

  it('USE_IN_MEMORY_DB が未設定で引数省略時は env の tableName で DynamoDB 実装を返す', () => {
    delete process.env.USE_IN_MEMORY_DB;
    process.env.DYNAMODB_TABLE_NAME = 'env-tbl';
    try {
      expect(createErrorEventWriter()).toBeInstanceOf(DynamoDBErrorEventWriter);
    } finally {
      delete process.env.DYNAMODB_TABLE_NAME;
    }
  });

  it('in-memory 実装は共有ストアに書き込む', async () => {
    process.env.USE_IN_MEMORY_DB = 'true';

    await createErrorEventWriter().put(sampleEvent());

    expect(
      getInMemoryErrorEventStore()
        .scanAll()
        .map((item) => item.eventId ?? item.EventId)
    ).toHaveLength(1);
  });

  it('resetErrorEventWriter は共有ストアも破棄し、同じ eventId で書き直せる', async () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    await createErrorEventWriter().put(sampleEvent());

    resetErrorEventWriter();

    expect(getInMemoryErrorEventStore().size()).toBe(0);
    await expect(createErrorEventWriter().put(sampleEvent())).resolves.toBeUndefined();
  });

  it('生成された Writer はシングルトンとして再利用される', () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    const first = createErrorEventWriter();
    const second = createErrorEventWriter();
    expect(first).toBe(second);
  });

  it('resetErrorEventWriter 後は新規インスタンスを返す', () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    const first = createErrorEventWriter();
    resetErrorEventWriter();
    const second = createErrorEventWriter();
    expect(first).not.toBe(second);
  });
});
