/**
 * createErrorEventReader の単体テスト
 */

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createErrorEventReader, resetErrorEventReader } from '../../../src/errors/factory.js';
import { DynamoDBErrorEventReader } from '../../../src/errors/dynamodb-reader.js';
import { InMemoryErrorEventReader } from '../../../src/errors/in-memory-reader.js';

describe('createErrorEventReader', () => {
  const originalUseInMemory = process.env.USE_IN_MEMORY_DB;
  const originalTableName = process.env.DYNAMODB_TABLE_NAME;

  beforeEach(() => {
    resetErrorEventReader();
    delete process.env.USE_IN_MEMORY_DB;
    delete process.env.DYNAMODB_TABLE_NAME;
  });

  afterEach(() => {
    if (originalUseInMemory === undefined) {
      delete process.env.USE_IN_MEMORY_DB;
    } else {
      process.env.USE_IN_MEMORY_DB = originalUseInMemory;
    }
    if (originalTableName === undefined) {
      delete process.env.DYNAMODB_TABLE_NAME;
    } else {
      process.env.DYNAMODB_TABLE_NAME = originalTableName;
    }
    resetErrorEventReader();
  });

  it('USE_IN_MEMORY_DB=true で in-memory 実装', () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    expect(createErrorEventReader()).toBeInstanceOf(InMemoryErrorEventReader);
  });

  it('docClient + tableName で DynamoDB 実装', () => {
    const mockClient = { send: jest.fn() } as unknown as DynamoDBDocumentClient;
    expect(createErrorEventReader(mockClient, 'tbl')).toBeInstanceOf(DynamoDBErrorEventReader);
  });

  it('引数省略時は env から tableName を取得して DynamoDB 実装', () => {
    process.env.DYNAMODB_TABLE_NAME = 'tbl';
    expect(createErrorEventReader()).toBeInstanceOf(DynamoDBErrorEventReader);
  });

  it('tableName が引数・env のいずれでも未指定なら例外', () => {
    expect(() => createErrorEventReader()).toThrow(
      '環境変数 DYNAMODB_TABLE_NAME が設定されていません'
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
