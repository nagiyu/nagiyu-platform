/**
 * createErrorEventReader の単体テスト
 */

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createErrorEventReader, resetErrorEventReader } from '../../../src/errors/factory.js';
import { DynamoDBErrorEventReader } from '../../../src/errors/dynamodb-reader.js';
import { InMemoryErrorEventReader } from '../../../src/errors/in-memory-reader.js';

describe('createErrorEventReader', () => {
  const original = process.env.USE_IN_MEMORY_DB;

  beforeEach(() => {
    resetErrorEventReader();
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.USE_IN_MEMORY_DB;
    } else {
      process.env.USE_IN_MEMORY_DB = original;
    }
    resetErrorEventReader();
  });

  it('USE_IN_MEMORY_DB=true で in-memory 実装', () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    expect(createErrorEventReader()).toBeInstanceOf(InMemoryErrorEventReader);
  });

  it('docClient + tableName で DynamoDB 実装', () => {
    delete process.env.USE_IN_MEMORY_DB;
    const mockClient = { send: jest.fn() } as unknown as DynamoDBDocumentClient;
    expect(createErrorEventReader(mockClient, 'tbl')).toBeInstanceOf(DynamoDBErrorEventReader);
  });

  it('docClient 欠落で例外', () => {
    delete process.env.USE_IN_MEMORY_DB;
    expect(() => createErrorEventReader(undefined, 'tbl')).toThrow(
      'DynamoDB 実装には docClient と tableName が必要です'
    );
  });

  it('tableName 欠落で例外', () => {
    delete process.env.USE_IN_MEMORY_DB;
    const mockClient = { send: jest.fn() } as unknown as DynamoDBDocumentClient;
    expect(() => createErrorEventReader(mockClient, undefined)).toThrow(
      'DynamoDB 実装には docClient と tableName が必要です'
    );
  });

  it('シングルトンとして再利用される', () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    expect(createErrorEventReader()).toBe(createErrorEventReader());
  });

  it('reset 後は新規インスタンス', () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    const first = createErrorEventReader();
    resetErrorEventReader();
    expect(createErrorEventReader()).not.toBe(first);
  });
});
