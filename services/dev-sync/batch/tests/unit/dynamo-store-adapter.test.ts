/**
 * DynamoDocumentClientStoreAdapter の単体テスト
 *
 * AWS SDK コマンド（Scan/Query/Put/Delete）をモックして
 * アダプタの変換ロジックを検証する。
 */

import { jest } from '@jest/globals';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBItem } from '@nagiyu/aws';
import { DynamoDocumentClientStoreAdapter } from '../../src/lib/dynamo-store-adapter.js';

// DynamoDBDocumentClient の send をモックする
const mockSend = jest.fn();
const mockDocClient = {
  send: mockSend,
} as unknown as DynamoDBDocumentClient;

describe('DynamoDocumentClientStoreAdapter', () => {
  let adapter: DynamoDocumentClientStoreAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new DynamoDocumentClientStoreAdapter(mockDocClient, 'nagiyu-test-table');
  });

  describe('scan', () => {
    it('フィルタなしで ScanCommand を送信する', async () => {
      mockSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

      const result = await adapter.scan({});

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(result.items).toEqual([]);
      expect(result.lastEvaluatedKey).toBeUndefined();
    });

    it('pkPrefix を FilterExpression に変換する', async () => {
      const items: DynamoDBItem[] = [
        {
          PK: 'USER#1',
          SK: 'PROFILE',
          Type: 'User',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
        },
      ];
      mockSend.mockResolvedValue({ Items: items, LastEvaluatedKey: undefined });

      const result = await adapter.scan({ pkPrefix: 'USER#' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].PK).toBe('USER#1');
    });

    it('pkPrefix と skPrefix を AND 条件で FilterExpression に変換する', async () => {
      mockSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

      await adapter.scan({ pkPrefix: 'USER#', skPrefix: 'PROFILE#' });

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('LastEvaluatedKey を Base64 エンコードして返す', async () => {
      const lastKey = { PK: 'USER#1', SK: 'PROFILE' };
      mockSend.mockResolvedValue({ Items: [], LastEvaluatedKey: lastKey });

      const result = await adapter.scan({});

      expect(result.lastEvaluatedKey).toBeDefined();
      // Base64 デコードで元のキーが復元できる
      const decoded = JSON.parse(
        Buffer.from(result.lastEvaluatedKey!, 'base64').toString('utf-8')
      ) as typeof lastKey;
      expect(decoded).toEqual(lastKey);
    });

    it('exclusiveStartKey を Base64 デコードして ExclusiveStartKey として渡す', async () => {
      const startKey = { PK: 'USER#2', SK: 'PROFILE' };
      const encoded = Buffer.from(JSON.stringify(startKey)).toString('base64');
      mockSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

      await adapter.scan({ exclusiveStartKey: encoded });

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('skPrefix のみを指定した場合も動作する', async () => {
      mockSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

      await adapter.scan({ skPrefix: 'PROFILE#' });

      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('queryGsi', () => {
    it('QueryCommand を GSI 名とキー条件で送信する', async () => {
      mockSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });

      const result = await adapter.queryGsi({
        indexName: 'GSI1',
        pkAttributeName: 'GSI1PK',
        pkValue: 'ALERT',
        skAttributeName: 'GSI1SK',
        skFrom: '2026-01-01T00:00:00.000Z',
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(result.items).toEqual([]);
      expect(result.lastEvaluatedKey).toBeUndefined();
    });

    it('結果アイテムをそのまま返す', async () => {
      const items: DynamoDBItem[] = [
        {
          PK: 'ALERT#1',
          SK: 'META',
          Type: 'Alert',
          GSI1PK: 'ALERT',
          GSI1SK: '2026-06-10T00:00:00.000Z',
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
        },
      ];
      mockSend.mockResolvedValue({ Items: items, LastEvaluatedKey: undefined });

      const result = await adapter.queryGsi({
        indexName: 'GSI1',
        pkAttributeName: 'GSI1PK',
        pkValue: 'ALERT',
        skAttributeName: 'GSI1SK',
        skFrom: '2026-01-01T00:00:00.000Z',
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].PK).toBe('ALERT#1');
    });

    it('exclusiveStartKey を渡せる', async () => {
      mockSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined });
      const startKey = { GSI1PK: 'ALERT', GSI1SK: '2026-06-01T00:00:00.000Z' };
      const encoded = Buffer.from(JSON.stringify(startKey)).toString('base64');

      await adapter.queryGsi({
        indexName: 'GSI1',
        pkAttributeName: 'GSI1PK',
        pkValue: 'ALERT',
        skAttributeName: 'GSI1SK',
        skFrom: '2026-01-01T00:00:00.000Z',
        exclusiveStartKey: encoded,
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('LastEvaluatedKey を Base64 エンコードして返す', async () => {
      const lastKey = { GSI1PK: 'ALERT', GSI1SK: '2026-06-10T00:00:00.000Z' };
      mockSend.mockResolvedValue({ Items: [], LastEvaluatedKey: lastKey });

      const result = await adapter.queryGsi({
        indexName: 'GSI1',
        pkAttributeName: 'GSI1PK',
        pkValue: 'ALERT',
        skAttributeName: 'GSI1SK',
        skFrom: '2026-01-01T00:00:00.000Z',
      });

      expect(result.lastEvaluatedKey).toBeDefined();
      const decoded = JSON.parse(
        Buffer.from(result.lastEvaluatedKey!, 'base64').toString('utf-8')
      ) as typeof lastKey;
      expect(decoded).toEqual(lastKey);
    });
  });

  describe('put', () => {
    it('PutCommand を送信する', async () => {
      mockSend.mockResolvedValue({});

      const item: DynamoDBItem = {
        PK: 'USER#1',
        SK: 'PROFILE',
        Type: 'User',
        CreatedAt: Date.now(),
        UpdatedAt: Date.now(),
      };

      await adapter.put(item);

      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('delete', () => {
    it('DeleteCommand を送信する', async () => {
      mockSend.mockResolvedValue({});

      await adapter.delete('USER#1', 'PROFILE');

      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });
});
