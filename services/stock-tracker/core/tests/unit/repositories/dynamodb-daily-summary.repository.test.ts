/**
 * Stock Tracker Core - DynamoDB Daily Summary Repository Unit Tests
 *
 * DynamoDBDailySummaryRepositoryのユニットテスト
 */

import {
  GetCommand,
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DatabaseError } from '@nagiyu/aws';
import { DynamoDBDailySummaryRepository } from '../../../src/repositories/dynamodb-daily-summary.repository.js';
import type { CreateDailySummaryInput } from '../../../src/entities/daily-summary.entity.js';

describe('DynamoDBDailySummaryRepository', () => {
  let repository: DynamoDBDailySummaryRepository;
  let mockDocClient: jest.Mocked<DynamoDBDocumentClient>;
  const TABLE_NAME = 'test-stock-tracker-table';

  beforeEach(() => {
    mockDocClient = {
      send: jest.fn(),
    } as unknown as jest.Mocked<DynamoDBDocumentClient>;

    repository = new DynamoDBDailySummaryRepository(mockDocClient, TABLE_NAME);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('getByTickerAndDate', () => {
    it('GetItem で指定したTickerIDとDateのサマリーを取得できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'SUMMARY#NSDQ:AAPL',
          SK: 'DATE#2026-02-27',
          Type: 'DailySummary',
          GSI4PK: 'NASDAQ',
          GSI4SK: 'DATE#2026-02-27#NSDQ:AAPL',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          Date: '2026-02-27',
          Open: 182.15,
          High: 183.92,
          Low: 181.44,
          Close: 183.31,
          CreatedAt: 1708992000000,
          UpdatedAt: 1708992000000,
        },
      });

      const result = await repository.getByTickerAndDate('NSDQ:AAPL', '2026-02-27');

      expect(result?.TickerID).toBe('NSDQ:AAPL');
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
      expect(mockDocClient.send.mock.calls[0][0]).toBeInstanceOf(GetCommand);
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(repository.getByTickerAndDate('NSDQ:AAPL', '2026-02-27')).rejects.toThrow(
        DatabaseError
      );
    });
  });

  describe('getByExchange', () => {
    it('GSI4 Query を使って指定日のサマリーを取得できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [
          {
            PK: 'SUMMARY#NSDQ:AAPL',
            SK: 'DATE#2026-02-27',
            Type: 'DailySummary',
            GSI4PK: 'NASDAQ',
            GSI4SK: 'DATE#2026-02-27#NSDQ:AAPL',
            TickerID: 'NSDQ:AAPL',
            ExchangeID: 'NASDAQ',
            Date: '2026-02-27',
            Open: 182.15,
            High: 183.92,
            Low: 181.44,
            Close: 183.31,
            CreatedAt: 1708992000000,
            UpdatedAt: 1708992000000,
          },
        ],
      });

      const result = await repository.getByExchange('NASDAQ', '2026-02-27');

      expect(result).toHaveLength(1);
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);

      const command = mockDocClient.send.mock.calls[0][0];
      expect(command).toBeInstanceOf(QueryCommand);
      expect((command as QueryCommand).input).toMatchObject({
        TableName: TABLE_NAME,
        IndexName: 'ExchangeSummaryIndex',
        KeyConditionExpression: '#gsi4pk = :exchangeId AND begins_with(#gsi4sk, :datePrefix)',
        ExpressionAttributeNames: {
          '#gsi4pk': 'GSI4PK',
          '#gsi4sk': 'GSI4SK',
        },
        ExpressionAttributeValues: {
          ':exchangeId': 'NASDAQ',
          ':datePrefix': 'DATE#2026-02-27',
        },
      });
    });

    it('date未指定時は最新日付のサマリーのみ返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [
          {
            PK: 'SUMMARY#NSDQ:AAPL',
            SK: 'DATE#2026-02-26',
            Type: 'DailySummary',
            GSI4PK: 'NASDAQ',
            GSI4SK: 'DATE#2026-02-26#NSDQ:AAPL',
            TickerID: 'NSDQ:AAPL',
            ExchangeID: 'NASDAQ',
            Date: '2026-02-26',
            Open: 180.0,
            High: 181.0,
            Low: 179.0,
            Close: 180.5,
            CreatedAt: 1708905600000,
            UpdatedAt: 1708905600000,
          },
          {
            PK: 'SUMMARY#NSDQ:AAPL',
            SK: 'DATE#2026-02-27',
            Type: 'DailySummary',
            GSI4PK: 'NASDAQ',
            GSI4SK: 'DATE#2026-02-27#NSDQ:AAPL',
            TickerID: 'NSDQ:AAPL',
            ExchangeID: 'NASDAQ',
            Date: '2026-02-27',
            Open: 182.15,
            High: 183.92,
            Low: 181.44,
            Close: 183.31,
            CreatedAt: 1708992000000,
            UpdatedAt: 1708992000000,
          },
        ],
      });

      const result = await repository.getByExchange('NASDAQ');

      expect(result).toHaveLength(1);
      expect(result[0].Date).toBe('2026-02-27');
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(repository.getByExchange('NASDAQ')).rejects.toThrow(DatabaseError);
    });
  });

  describe('upsert', () => {
    it('PutItem でサマリーを upsert できる', async () => {
      const now = 1708992000000;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      const input: CreateDailySummaryInput = {
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: 182.15,
        High: 183.92,
        Low: 181.44,
        Close: 183.31,
      };

      mockDocClient.send
        .mockResolvedValueOnce({ Item: undefined })
        .mockResolvedValueOnce({ $metadata: {} });

      const result = await repository.upsert(input);

      expect(result).toEqual({
        ...input,
        CreatedAt: now,
        UpdatedAt: now,
      });
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);
      expect(mockDocClient.send.mock.calls[0][0]).toBeInstanceOf(GetCommand);
      expect(mockDocClient.send.mock.calls[1][0]).toBeInstanceOf(PutCommand);

      const putCommand = mockDocClient.send.mock.calls[1][0] as PutCommand;
      expect(putCommand.input).toMatchObject({
        TableName: TABLE_NAME,
        Item: {
          PK: 'SUMMARY#NSDQ:AAPL',
          SK: 'DATE#2026-02-27',
          Type: 'DailySummary',
          GSI4PK: 'NASDAQ',
          GSI4SK: 'DATE#2026-02-27#NSDQ:AAPL',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          Date: '2026-02-27',
          Open: 182.15,
          High: 183.92,
          Low: 181.44,
          Close: 183.31,
          CreatedAt: now,
          UpdatedAt: now,
        },
      });
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(
        repository.upsert({
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          Date: '2026-02-27',
          Open: 182.15,
          High: 183.92,
          Low: 181.44,
          Close: 183.31,
        })
      ).rejects.toThrow(DatabaseError);
    });
  });
});
