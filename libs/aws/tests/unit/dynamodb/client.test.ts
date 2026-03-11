import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  clearDynamoDBClientCache,
  getDynamoDBDocumentClient,
  getTableName,
} from '../../../src/dynamodb/client.js';

jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');

describe('dynamodb client', () => {
  beforeEach(() => {
    clearDynamoDBClientCache();
    jest.clearAllMocks();
    (DynamoDBClient as jest.Mock).mockImplementation((config) => ({ config }));
    (DynamoDBDocumentClient.from as jest.Mock).mockImplementation((client) => ({ client }));
    delete process.env.AWS_REGION;
    delete process.env.DYNAMODB_TABLE_NAME;
  });

  it('同じリージョンでは同一のDocumentClientを返す', () => {
    const client1 = getDynamoDBDocumentClient('us-east-1');
    const client2 = getDynamoDBDocumentClient('us-east-1');

    expect(client1).toBe(client2);
    expect(DynamoDBClient).toHaveBeenCalledTimes(1);
    expect(DynamoDBDocumentClient.from).toHaveBeenCalledTimes(1);
  });

  it('リージョンごとにDocumentClientを分離する', () => {
    const client1 = getDynamoDBDocumentClient('us-east-1');
    const client2 = getDynamoDBDocumentClient('ap-northeast-1');

    expect(client1).not.toBe(client2);
    expect(DynamoDBClient).toHaveBeenCalledTimes(2);
  });

  it('テーブル名が未設定の場合はエラーを投げる', () => {
    expect(() => getTableName()).toThrow('環境変数 DYNAMODB_TABLE_NAME が設定されていません');
  });

  it('テーブル名が未設定でもdefaultValueがあればそれを返す', () => {
    expect(getTableName('fallback-table')).toBe('fallback-table');
  });
});
