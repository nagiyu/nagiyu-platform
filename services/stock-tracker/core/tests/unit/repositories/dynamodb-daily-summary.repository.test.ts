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

    it('date未指定時はGSI4を降順・1件で引いて最新日を特定し、その日のサマリーのみ返す', async () => {
      const buildItem = (tickerId: string, date: string) => ({
        PK: `SUMMARY#${tickerId}`,
        SK: `DATE#${date}`,
        Type: 'DailySummary',
        GSI4PK: 'NASDAQ',
        GSI4SK: `DATE#${date}#${tickerId}`,
        TickerID: tickerId,
        ExchangeID: 'NASDAQ',
        Date: date,
        Open: 182.15,
        High: 183.92,
        Low: 181.44,
        Close: 183.31,
        CreatedAt: 1708992000000,
        UpdatedAt: 1708992000000,
      });
      mockDocClient.send
        .mockResolvedValueOnce({ Items: [buildItem('NSDQ:MSFT', '2026-02-27')] })
        .mockResolvedValueOnce({
          Items: [buildItem('NSDQ:AAPL', '2026-02-27'), buildItem('NSDQ:MSFT', '2026-02-27')],
        });

      const result = await repository.getByExchange('NASDAQ');

      expect(result.map((r) => r.TickerID)).toEqual(['NSDQ:AAPL', 'NSDQ:MSFT']);
      expect(result.every((r) => r.Date === '2026-02-27')).toBe(true);
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);

      const latestQuery = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(latestQuery.input).toMatchObject({
        IndexName: 'ExchangeSummaryIndex',
        KeyConditionExpression: '#gsi4pk = :exchangeId',
        ScanIndexForward: false,
        Limit: 1,
      });
      const dayQuery = mockDocClient.send.mock.calls[1][0] as QueryCommand;
      expect(dayQuery.input).toMatchObject({
        KeyConditionExpression: '#gsi4pk = :exchangeId AND begins_with(#gsi4sk, :datePrefix)',
        ExpressionAttributeValues: {
          ':exchangeId': 'NASDAQ',
          ':datePrefix': 'DATE#2026-02-27',
        },
      });
    });

    it('date未指定でサマリーが1件もない場合は最新日の問い合わせだけで空配列を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [] });

      const result = await repository.getByExchange('NASDAQ');

      expect(result).toEqual([]);
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('date指定時に複数ページを取得して全件返す', async () => {
      mockDocClient.send
        .mockResolvedValueOnce({
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
          LastEvaluatedKey: {
            PK: 'SUMMARY#NSDQ:AAPL',
            SK: 'DATE#2026-02-27',
          },
        })
        .mockResolvedValueOnce({
          Items: [
            {
              PK: 'SUMMARY#NSDQ:MSFT',
              SK: 'DATE#2026-02-27',
              Type: 'DailySummary',
              GSI4PK: 'NASDAQ',
              GSI4SK: 'DATE#2026-02-27#NSDQ:MSFT',
              TickerID: 'NSDQ:MSFT',
              ExchangeID: 'NASDAQ',
              Date: '2026-02-27',
              Open: 405.0,
              High: 408.0,
              Low: 404.0,
              Close: 407.5,
              CreatedAt: 1708992000000,
              UpdatedAt: 1708992000000,
            },
          ],
        });

      const result = await repository.getByExchange('NASDAQ', '2026-02-27');

      expect(result).toHaveLength(2);
      expect(result.map((item) => item.TickerID)).toEqual(['NSDQ:AAPL', 'NSDQ:MSFT']);
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);

      const secondCommand = mockDocClient.send.mock.calls[1][0] as QueryCommand;
      expect(secondCommand.input.ExclusiveStartKey).toEqual({
        PK: 'SUMMARY#NSDQ:AAPL',
        SK: 'DATE#2026-02-27',
      });
    });

    it('date未指定時も最新日の問い合わせが複数ページに及ぶ場合は全件集約する', async () => {
      const buildItem = (tickerId: string) => ({
        PK: `SUMMARY#${tickerId}`,
        SK: 'DATE#2026-02-27',
        Type: 'DailySummary',
        GSI4PK: 'NASDAQ',
        GSI4SK: `DATE#2026-02-27#${tickerId}`,
        TickerID: tickerId,
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: 1,
        High: 2,
        Low: 0.5,
        Close: 1.5,
        CreatedAt: 1708992000000,
        UpdatedAt: 1708992000000,
      });
      mockDocClient.send
        .mockResolvedValueOnce({ Items: [buildItem('NSDQ:MSFT')] })
        .mockResolvedValueOnce({
          Items: [buildItem('NSDQ:AAPL')],
          LastEvaluatedKey: { PK: 'SUMMARY#NSDQ:AAPL', SK: 'DATE#2026-02-27' },
        })
        .mockResolvedValueOnce({ Items: [buildItem('NSDQ:MSFT')] });

      const result = await repository.getByExchange('NASDAQ');

      expect(result.map((r) => r.TickerID)).toEqual(['NSDQ:AAPL', 'NSDQ:MSFT']);
      expect(mockDocClient.send).toHaveBeenCalledTimes(3);
      expect((mockDocClient.send.mock.calls[2][0] as QueryCommand).input.ExclusiveStartKey).toEqual(
        {
          PK: 'SUMMARY#NSDQ:AAPL',
          SK: 'DATE#2026-02-27',
        }
      );
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

  describe('getByExchangeAndDateRange', () => {
    it('GSI4 を BETWEEN クエリで利用し、期間内の項目を返す', async () => {
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

      const result = await repository.getByExchangeAndDateRange(
        'NASDAQ',
        '2026-02-20',
        '2026-02-27'
      );

      expect(result).toHaveLength(1);
      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command).toBeInstanceOf(QueryCommand);
      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        IndexName: 'ExchangeSummaryIndex',
        KeyConditionExpression: '#gsi4pk = :exchangeId AND #gsi4sk BETWEEN :from AND :to',
        ExpressionAttributeNames: {
          '#gsi4pk': 'GSI4PK',
          '#gsi4sk': 'GSI4SK',
        },
        ExpressionAttributeValues: {
          ':exchangeId': 'NASDAQ',
          ':from': 'DATE#2026-02-20',
          ':to': 'DATE#2026-02-27#~',
        },
      });
    });

    it('複数ページを LastEvaluatedKey で連結して取得する', async () => {
      mockDocClient.send
        .mockResolvedValueOnce({
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
          ],
          LastEvaluatedKey: { PK: 'SUMMARY#NSDQ:AAPL', SK: 'DATE#2026-02-26' },
        })
        .mockResolvedValueOnce({
          Items: [
            {
              PK: 'SUMMARY#NSDQ:MSFT',
              SK: 'DATE#2026-02-27',
              Type: 'DailySummary',
              GSI4PK: 'NASDAQ',
              GSI4SK: 'DATE#2026-02-27#NSDQ:MSFT',
              TickerID: 'NSDQ:MSFT',
              ExchangeID: 'NASDAQ',
              Date: '2026-02-27',
              Open: 405.0,
              High: 408.0,
              Low: 404.0,
              Close: 407.5,
              CreatedAt: 1708992000000,
              UpdatedAt: 1708992000000,
            },
          ],
        });

      const result = await repository.getByExchangeAndDateRange(
        'NASDAQ',
        '2026-02-26',
        '2026-02-27'
      );

      expect(result).toHaveLength(2);
      expect(result.map((item) => item.TickerID)).toEqual(['NSDQ:AAPL', 'NSDQ:MSFT']);
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);

      const second = mockDocClient.send.mock.calls[1][0] as QueryCommand;
      expect(second.input.ExclusiveStartKey).toEqual({
        PK: 'SUMMARY#NSDQ:AAPL',
        SK: 'DATE#2026-02-26',
      });
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(
        repository.getByExchangeAndDateRange('NASDAQ', '2026-02-20', '2026-02-27')
      ).rejects.toThrow(DatabaseError);
    });
  });

  describe('getForecastFieldsByExchangeAndDateRange', () => {
    it('GSI4 を BETWEEN クエリで利用し、ProjectionExpression で絞った射影を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [
          {
            TickerID: 'NSDQ:AAPL',
            ExchangeID: 'NASDAQ',
            Date: '2026-02-27',
            Open: 182.15,
            High: 183.92,
            Low: 181.44,
            Close: 183.31,
            Volume: 1234567,
            CreatedAt: 1708992000000,
          },
        ],
      });

      const result = await repository.getForecastFieldsByExchangeAndDateRange(
        'NASDAQ',
        '2026-02-20',
        '2026-02-27'
      );

      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('UpdatedAt');
      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command).toBeInstanceOf(QueryCommand);
      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        IndexName: 'ExchangeSummaryIndex',
        KeyConditionExpression: '#gsi4pk = :exchangeId AND #gsi4sk BETWEEN :from AND :to',
        ProjectionExpression:
          '#tickerId, #exchangeId, #date, #open, #high, #low, #close, #volume, ' +
          '#patternResults, #buyPatternCount, #sellPatternCount, #createdAt',
        ExpressionAttributeValues: {
          ':exchangeId': 'NASDAQ',
          ':from': 'DATE#2026-02-20',
          ':to': 'DATE#2026-02-27#~',
        },
      });
      expect(command.input.ExpressionAttributeNames).not.toHaveProperty('#updatedAt');
    });

    it('LastEvaluatedKey がある間は全ページを読み出す', async () => {
      const lastKey = { PK: 'SUMMARY#NSDQ:AAPL', SK: 'DATE#2026-02-27' };
      const buildItem = (tickerId: string) => ({
        TickerID: tickerId,
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: 182.15,
        High: 183.92,
        Low: 181.44,
        Close: 183.31,
        Volume: 1234567,
        CreatedAt: 1708992000000,
      });
      mockDocClient.send
        .mockResolvedValueOnce({ Items: [buildItem('NSDQ:AAPL')], LastEvaluatedKey: lastKey })
        .mockResolvedValueOnce({ Items: [buildItem('NSDQ:MSFT')] });

      const result = await repository.getForecastFieldsByExchangeAndDateRange(
        'NASDAQ',
        '2026-02-20',
        '2026-02-27'
      );

      expect(result.map((fields) => fields.TickerID)).toEqual(['NSDQ:AAPL', 'NSDQ:MSFT']);
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);
      const first = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      const second = mockDocClient.send.mock.calls[1][0] as QueryCommand;
      expect(first.input).not.toHaveProperty('ExclusiveStartKey');
      expect(second.input.ExclusiveStartKey).toEqual(lastKey);
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(
        repository.getForecastFieldsByExchangeAndDateRange('NASDAQ', '2026-02-20', '2026-02-27')
      ).rejects.toThrow(DatabaseError);
    });
  });
});
