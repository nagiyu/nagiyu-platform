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

  it('USE_IN_MEMORY_DB が未設定で docClient が欠けているときは例外を投げる', () => {
    delete process.env.USE_IN_MEMORY_DB;
    expect(() => createErrorEventWriter(undefined, 'tbl')).toThrow(
      'DynamoDB 実装には docClient と tableName が必要です'
    );
  });

  it('USE_IN_MEMORY_DB が未設定で tableName が欠けているときは例外を投げる', () => {
    delete process.env.USE_IN_MEMORY_DB;
    const mockClient = { send: jest.fn() } as unknown as DynamoDBDocumentClient;
    expect(() => createErrorEventWriter(mockClient, undefined)).toThrow(
      'DynamoDB 実装には docClient と tableName が必要です'
    );
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
