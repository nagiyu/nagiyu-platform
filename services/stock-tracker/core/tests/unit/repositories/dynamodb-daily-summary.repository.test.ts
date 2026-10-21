/**
 * Stock Tracker Core - DynamoDB Daily Summary Repository Unit Tests
 *
 * DynamoDBDailySummaryRepositoryのユニットテスト
 *
 * 単一アイテムの CRUD の振る舞い (条件式・エラー変換など) は EntityStore の責務のため、
 * ここでは Repository 経由で正しく動くことと、GSI4 の Query・射影・upsert の作成日時の引き継ぎだけを検証する。
 */

import {
  GetCommand,
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DatabaseError, InvalidEntityDataError } from '@nagiyu/aws';
import { DynamoDBDailySummaryRepository } from '../../../src/repositories/dynamodb-daily-summary.repository.js';
import type { CreateDailySummaryInput } from '../../../src/entities/daily-summary.entity.js';

const NOW = 1709078400000;
const CREATED_AT = 1708992000000;

function buildItem(
  tickerId: string,
  date: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
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
    CreatedAt: CREATED_AT,
    UpdatedAt: CREATED_AT,
    ...overrides,
  };
}

describe('DynamoDBDailySummaryRepository', () => {
  let repository: DynamoDBDailySummaryRepository;
  let mockDocClient: jest.Mocked<DynamoDBDocumentClient>;
  const TABLE_NAME = 'test-stock-tracker-table';

  beforeEach(() => {
    // UpdatedAt は EntityStore が現在時刻で書くため、時刻を固定して検証する
    jest.useFakeTimers().setSystemTime(NOW);

    mockDocClient = {
      send: jest.fn(),
    } as unknown as jest.Mocked<DynamoDBDocumentClient>;

    repository = new DynamoDBDailySummaryRepository(mockDocClient, TABLE_NAME);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('getByTickerAndDate', () => {
    it('ティッカーIDと日付から組み立てたキーで取得し、Entity として返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: buildItem('NSDQ:AAPL', '2026-02-27') });

      const result = await repository.getByTickerAndDate('NSDQ:AAPL', '2026-02-27');

      expect(result).toEqual({
        tickerId: 'NSDQ:AAPL',
        exchangeId: 'NASDAQ',
        date: '2026-02-27',
        open: 182.15,
        high: 183.92,
        low: 181.44,
        close: 183.31,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      });
      const command = mockDocClient.send.mock.calls[0][0] as GetCommand;
      expect(command).toBeInstanceOf(GetCommand);
      expect(command.input.Key).toEqual({ PK: 'SUMMARY#NSDQ:AAPL', SK: 'DATE#2026-02-27' });
    });
  });

  describe('getByExchange', () => {
    it('GSI4 Query を使って指定日のサマリーを取得できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [buildItem('NSDQ:AAPL', '2026-02-27')],
      });

      const result = await repository.getByExchange('NASDAQ', '2026-02-27');

      expect(result.map((r) => r.tickerId)).toEqual(['NSDQ:AAPL']);
      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command).toBeInstanceOf(QueryCommand);
      expect(command.input).toMatchObject({
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
      mockDocClient.send
        .mockResolvedValueOnce({ Items: [buildItem('NSDQ:MSFT', '2026-02-27')] })
        .mockResolvedValueOnce({
          Items: [buildItem('NSDQ:AAPL', '2026-02-27'), buildItem('NSDQ:MSFT', '2026-02-27')],
        });

      const result = await repository.getByExchange('NASDAQ');

      expect(result.map((r) => r.tickerId)).toEqual(['NSDQ:AAPL', 'NSDQ:MSFT']);
      expect(result.every((r) => r.date === '2026-02-27')).toBe(true);
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);

      const latestQuery = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(latestQuery.input).toMatchObject({
        IndexName: 'ExchangeSummaryIndex',
        KeyConditionExpression: '#gsi4pk = :exchangeId',
        ExpressionAttributeValues: { ':exchangeId': 'NASDAQ' },
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
      const lastKey = { PK: 'SUMMARY#NSDQ:AAPL', SK: 'DATE#2026-02-27' };
      mockDocClient.send
        .mockResolvedValueOnce({
          Items: [buildItem('NSDQ:AAPL', '2026-02-27')],
          LastEvaluatedKey: lastKey,
        })
        .mockResolvedValueOnce({ Items: [buildItem('NSDQ:MSFT', '2026-02-27')] });

      const result = await repository.getByExchange('NASDAQ', '2026-02-27');

      expect(result.map((r) => r.tickerId)).toEqual(['NSDQ:AAPL', 'NSDQ:MSFT']);
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);
      const second = mockDocClient.send.mock.calls[1][0] as QueryCommand;
      expect(second.input.ExclusiveStartKey).toEqual(lastKey);
    });

    it('date未指定時も最新日の問い合わせが複数ページに及ぶ場合は全件集約する', async () => {
      const lastKey = { PK: 'SUMMARY#NSDQ:AAPL', SK: 'DATE#2026-02-27' };
      mockDocClient.send
        .mockResolvedValueOnce({ Items: [buildItem('NSDQ:MSFT', '2026-02-27')] })
        .mockResolvedValueOnce({
          Items: [buildItem('NSDQ:AAPL', '2026-02-27')],
          LastEvaluatedKey: lastKey,
        })
        .mockResolvedValueOnce({ Items: [buildItem('NSDQ:MSFT', '2026-02-27')] });

      const result = await repository.getByExchange('NASDAQ');

      expect(result.map((r) => r.tickerId)).toEqual(['NSDQ:AAPL', 'NSDQ:MSFT']);
      expect(mockDocClient.send).toHaveBeenCalledTimes(3);
      const third = mockDocClient.send.mock.calls[2][0] as QueryCommand;
      expect(third.input.ExclusiveStartKey).toEqual(lastKey);
    });

    it('読めないアイテムを含むと InvalidEntityDataError をスローする', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [buildItem('NSDQ:AAPL', '2026-02-27', { Close: 'broken' })],
      });

      await expect(repository.getByExchange('NASDAQ', '2026-02-27')).rejects.toThrow(
        InvalidEntityDataError
      );
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(repository.getByExchange('NASDAQ')).rejects.toThrow(DatabaseError);
    });
  });

  describe('upsert', () => {
    const input: CreateDailySummaryInput = {
      tickerId: 'NSDQ:AAPL',
      exchangeId: 'NASDAQ',
      date: '2026-02-27',
      open: 182.15,
      high: 183.92,
      low: 181.44,
      close: 183.31,
    };

    it('既存がなければ createdAt と updatedAt を現在時刻にして保存形式で書き込む', async () => {
      mockDocClient.send
        .mockResolvedValueOnce({ Item: undefined })
        .mockResolvedValueOnce({ $metadata: {} });

      const result = await repository.upsert(input);

      expect(result).toMatchObject({ ...input, createdAt: NOW, updatedAt: NOW });
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);
      expect(mockDocClient.send.mock.calls[0][0]).toBeInstanceOf(GetCommand);
      const put = mockDocClient.send.mock.calls[1][0] as PutCommand;
      expect(put).toBeInstanceOf(PutCommand);
      expect(put.input).toMatchObject({
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
          CreatedAt: NOW,
          UpdatedAt: NOW,
        },
      });
    });

    it('既存があれば作成日時を引き継ぎ、更新日時だけを現在時刻にする', async () => {
      mockDocClient.send
        .mockResolvedValueOnce({ Item: buildItem('NSDQ:AAPL', '2026-02-27') })
        .mockResolvedValueOnce({ $metadata: {} });

      const result = await repository.upsert({ ...input, close: 190 });

      expect(result).toMatchObject({ close: 190, createdAt: CREATED_AT, updatedAt: NOW });
      const put = mockDocClient.send.mock.calls[1][0] as PutCommand;
      expect(put.input.Item).toMatchObject({ Close: 190, CreatedAt: CREATED_AT, UpdatedAt: NOW });
    });

    it('条件なしの Put で書き込む (既存の上書きを許す)', async () => {
      mockDocClient.send
        .mockResolvedValueOnce({ Item: undefined })
        .mockResolvedValueOnce({ $metadata: {} });

      await repository.upsert(input);

      const put = mockDocClient.send.mock.calls[1][0] as PutCommand;
      expect(put.input.ConditionExpression).toBeUndefined();
    });
  });

  describe('getByExchangeAndDateRange', () => {
    it('GSI4 を BETWEEN クエリで利用し、期間内の項目を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [buildItem('NSDQ:AAPL', '2026-02-27')],
      });

      const result = await repository.getByExchangeAndDateRange(
        'NASDAQ',
        '2026-02-20',
        '2026-02-27'
      );

      expect(result.map((r) => r.tickerId)).toEqual(['NSDQ:AAPL']);
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
      const lastKey = { PK: 'SUMMARY#NSDQ:AAPL', SK: 'DATE#2026-02-26' };
      mockDocClient.send
        .mockResolvedValueOnce({
          Items: [buildItem('NSDQ:AAPL', '2026-02-26')],
          LastEvaluatedKey: lastKey,
        })
        .mockResolvedValueOnce({ Items: [buildItem('NSDQ:MSFT', '2026-02-27')] });

      const result = await repository.getByExchangeAndDateRange(
        'NASDAQ',
        '2026-02-26',
        '2026-02-27'
      );

      expect(result.map((r) => r.tickerId)).toEqual(['NSDQ:AAPL', 'NSDQ:MSFT']);
      const second = mockDocClient.send.mock.calls[1][0] as QueryCommand;
      expect(second.input.ExclusiveStartKey).toEqual(lastKey);
    });

    it('データベースエラー時にDatabaseErrorをスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(
        repository.getByExchangeAndDateRange('NASDAQ', '2026-02-20', '2026-02-27')
      ).rejects.toThrow(DatabaseError);
    });
  });

  describe('getForecastFieldsByExchangeAndDateRange', () => {
    function buildProjectedItem(tickerId: string): Record<string, unknown> {
      return {
        TickerID: tickerId,
        ExchangeID: 'NASDAQ',
        Date: '2026-02-27',
        Open: 182.15,
        High: 183.92,
        Low: 181.44,
        Close: 183.31,
        Volume: 1234567,
        CreatedAt: CREATED_AT,
      };
    }

    /** ProjectionExpression のプレースホルダを属性名に解決する */
    function resolveProjection(command: QueryCommand): string[] {
      const names = command.input.ExpressionAttributeNames ?? {};
      return (command.input.ProjectionExpression ?? '').split(', ').map((path) =>
        path
          .split('.')
          .map((placeholder) => names[placeholder])
          .join('.')
      );
    }

    it('GSI4 を BETWEEN クエリで利用し、ProjectionExpression で絞った射影を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [buildProjectedItem('NSDQ:AAPL')] });

      const result = await repository.getForecastFieldsByExchangeAndDateRange(
        'NASDAQ',
        '2026-02-20',
        '2026-02-27'
      );

      expect(result).toEqual([
        {
          tickerId: 'NSDQ:AAPL',
          exchangeId: 'NASDAQ',
          date: '2026-02-27',
          open: 182.15,
          high: 183.92,
          low: 181.44,
          close: 183.31,
          volume: 1234567,
          createdAt: CREATED_AT,
        },
      ]);
      expect(result[0]).not.toHaveProperty('updatedAt');
      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command).toBeInstanceOf(QueryCommand);
      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        IndexName: 'ExchangeSummaryIndex',
        KeyConditionExpression: '#gsi4pk = :exchangeId AND #gsi4sk BETWEEN :from AND :to',
        ExpressionAttributeValues: {
          ':exchangeId': 'NASDAQ',
          ':from': 'DATE#2026-02-20',
          ':to': 'DATE#2026-02-27#~',
        },
      });
      expect(command.input.ExpressionAttributeNames).toMatchObject({
        '#gsi4pk': 'GSI4PK',
        '#gsi4sk': 'GSI4SK',
      });
    });

    it('射影するのは確度算出に使う保存属性だけで、UpdatedAt を含めない', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [] });

      await repository.getForecastFieldsByExchangeAndDateRange(
        'NASDAQ',
        '2026-02-20',
        '2026-02-27'
      );

      const projected = resolveProjection(mockDocClient.send.mock.calls[0][0] as QueryCommand);
      expect(projected).toEqual([
        'TickerID',
        'ExchangeID',
        'Date',
        'Open',
        'High',
        'Low',
        'Close',
        'Volume',
        'PatternResults',
        'BuyPatternCount',
        'SellPatternCount',
        'CreatedAt',
      ]);
    });

    it('式で使わないプレースホルダを ExpressionAttributeNames に含めない', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [] });

      await repository.getForecastFieldsByExchangeAndDateRange(
        'NASDAQ',
        '2026-02-20',
        '2026-02-27'
      );

      const { input } = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      const expressions = `${input.KeyConditionExpression} ${input.ProjectionExpression}`;
      for (const placeholder of Object.keys(input.ExpressionAttributeNames ?? {})) {
        expect(expressions).toContain(placeholder);
      }
    });

    it('LastEvaluatedKey がある間は全ページを読み出す', async () => {
      const lastKey = { PK: 'SUMMARY#NSDQ:AAPL', SK: 'DATE#2026-02-27' };
      mockDocClient.send
        .mockResolvedValueOnce({
          Items: [buildProjectedItem('NSDQ:AAPL')],
          LastEvaluatedKey: lastKey,
        })
        .mockResolvedValueOnce({ Items: [buildProjectedItem('NSDQ:MSFT')] });

      const result = await repository.getForecastFieldsByExchangeAndDateRange(
        'NASDAQ',
        '2026-02-20',
        '2026-02-27'
      );

      expect(result.map((fields) => fields.tickerId)).toEqual(['NSDQ:AAPL', 'NSDQ:MSFT']);
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
