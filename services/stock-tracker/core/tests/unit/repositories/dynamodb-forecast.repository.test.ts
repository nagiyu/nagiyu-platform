/**
 * Stock Tracker Core - DynamoDB Forecast Repository Unit Tests
 *
 * DynamoDBForecastRepositoryのユニットテスト
 */
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DatabaseError, EntityNotFoundError } from '@nagiyu/aws';
import { DynamoDBForecastRepository } from '../../../src/repositories/dynamodb-forecast.repository.js';
import type { CreateForecastInput } from '../../../src/entities/forecast.entity.js';
import type { TickerOutcome } from '../../../src/forecast/index.js';

describe('DynamoDBForecastRepository', () => {
  let repository: DynamoDBForecastRepository;
  let mockDocClient: jest.Mocked<DynamoDBDocumentClient>;
  const TABLE_NAME = 'test-stock-tracker-table';

  const createInput: CreateForecastInput = {
    TickerID: 'NSDQ:AAPL',
    ExchangeID: 'NASDAQ',
    Market: 'US',
    Date: '2026-02-27',
    AxisValues: { 'buy-count-ge2': true },
    Normal: { range: 0.03 },
    Probabilities: {},
    ModelVersion: 'forecast-core-v1',
    Source: 'LIVE',
  };

  beforeEach(() => {
    mockDocClient = { send: jest.fn() } as unknown as jest.Mocked<DynamoDBDocumentClient>;
    repository = new DynamoDBForecastRepository(mockDocClient, TABLE_NAME);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('createIfAbsent', () => {
    it('条件付き PutItem で新規作成する', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      const result = await repository.createIfAbsent(createInput);

      expect(result.created).toBe(true);
      expect(result.item.TickerID).toBe('NSDQ:AAPL');
      const command = mockDocClient.send.mock.calls[0][0] as PutCommand;
      expect(command).toBeInstanceOf(PutCommand);
      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        ConditionExpression: 'attribute_not_exists(PK)',
      });
    });

    it('既に存在する場合は書き込まず、既存のアイテムを created:false で返す', async () => {
      const conditionalError = new Error('The conditional request failed');
      conditionalError.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(conditionalError).mockResolvedValueOnce({
        Item: {
          PK: 'FORECAST#NSDQ:AAPL',
          SK: 'DATE#2026-02-27',
          Type: 'Forecast',
          GSI4PK: 'FORECAST#NASDAQ',
          GSI4SK: 'DATE#2026-02-27#NSDQ:AAPL',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          Market: 'US',
          Date: '2026-02-27',
          AxisValues: {},
          Normal: {},
          Probabilities: {},
          ModelVersion: 'forecast-core-v1',
          Source: 'LIVE',
          CreatedAt: 1_700_000_000_000,
          UpdatedAt: 1_700_000_000_000,
        },
      });

      const result = await repository.createIfAbsent(createInput);

      expect(result.created).toBe(false);
      expect(result.item.TickerID).toBe('NSDQ:AAPL');
    });

    it('データベースエラー時に DatabaseError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('boom'));
      await expect(repository.createIfAbsent(createInput)).rejects.toThrow(DatabaseError);
    });
  });

  describe('appendOutcome', () => {
    const outcome: TickerOutcome = {
      tickerId: 'NSDQ:AAPL',
      exchangeId: 'NASDAQ',
      market: 'US',
      date: '2026-02-27',
      nextDate: '2026-02-28',
      nextReturn: 0.01,
      excessReturn: 0.005,
      nextRange: 0.02,
      rangeRatio: 1.1,
      hit: { DIR: true },
      evaluatedAt: 1_700_100_000_000,
    };

    it('条件付き UpdateItem で Outcome を追記する', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: {
          PK: 'FORECAST#NSDQ:AAPL',
          SK: 'DATE#2026-02-27',
          Type: 'Forecast',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          Market: 'US',
          Date: '2026-02-27',
          AxisValues: {},
          Normal: {},
          Probabilities: {},
          ModelVersion: 'forecast-core-v1',
          Source: 'LIVE',
          Outcome: { nextDate: '2026-02-28', hit: { DIR: true }, evaluatedAt: 1_700_100_000_000 },
          CreatedAt: 1_700_000_000_000,
          UpdatedAt: 1_700_100_000_000,
        },
      });

      const result = await repository.appendOutcome(
        { tickerId: 'NSDQ:AAPL', date: '2026-02-27' },
        outcome
      );

      expect(result.updated).toBe(true);
      expect(result.item.Outcome?.hit.DIR).toBe(true);
      const command = mockDocClient.send.mock.calls[0][0] as UpdateCommand;
      expect(command).toBeInstanceOf(UpdateCommand);
      expect(command.input).toMatchObject({
        ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(Outcome)',
      });
    });

    it('既に Outcome がある場合は書き込まず updated:false を返す', async () => {
      const conditionalError = new Error('The conditional request failed');
      conditionalError.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(conditionalError).mockResolvedValueOnce({
        Item: {
          PK: 'FORECAST#NSDQ:AAPL',
          SK: 'DATE#2026-02-27',
          Type: 'Forecast',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          Market: 'US',
          Date: '2026-02-27',
          AxisValues: {},
          Normal: {},
          Probabilities: {},
          ModelVersion: 'forecast-core-v1',
          Source: 'LIVE',
          Outcome: { nextDate: '2026-02-28', hit: { DIR: false }, evaluatedAt: 1_699_000_000_000 },
          CreatedAt: 1_700_000_000_000,
          UpdatedAt: 1_699_000_000_000,
        },
      });

      const result = await repository.appendOutcome(
        { tickerId: 'NSDQ:AAPL', date: '2026-02-27' },
        outcome
      );

      expect(result.updated).toBe(false);
      expect(result.item.Outcome?.hit.DIR).toBe(false);
    });

    it('対象 Forecast が存在しない場合は EntityNotFoundError をスローする', async () => {
      const conditionalError = new Error('The conditional request failed');
      conditionalError.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(conditionalError).mockResolvedValueOnce({
        Item: undefined,
      });

      await expect(
        repository.appendOutcome({ tickerId: 'NO-SUCH', date: '2026-02-27' }, outcome)
      ).rejects.toBeInstanceOf(EntityNotFoundError);
    });

    it('その他のデータベースエラーは DatabaseError に変換される', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('boom'));
      await expect(
        repository.appendOutcome({ tickerId: 'NSDQ:AAPL', date: '2026-02-27' }, outcome)
      ).rejects.toThrow(DatabaseError);
    });
  });

  describe('getByTickerAndDate', () => {
    it('GetItem で取得できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'FORECAST#NSDQ:AAPL',
          SK: 'DATE#2026-02-27',
          Type: 'Forecast',
          TickerID: 'NSDQ:AAPL',
          ExchangeID: 'NASDAQ',
          Market: 'US',
          Date: '2026-02-27',
          AxisValues: {},
          Normal: {},
          Probabilities: {},
          ModelVersion: 'forecast-core-v1',
          Source: 'LIVE',
          CreatedAt: 1_700_000_000_000,
          UpdatedAt: 1_700_000_000_000,
        },
      });

      const result = await repository.getByTickerAndDate('NSDQ:AAPL', '2026-02-27');
      expect(result?.TickerID).toBe('NSDQ:AAPL');
      expect(mockDocClient.send.mock.calls[0][0]).toBeInstanceOf(GetCommand);
    });

    it('存在しない場合は null を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: undefined });
      expect(await repository.getByTickerAndDate('NO-SUCH', '2026-02-27')).toBeNull();
    });

    it('データベースエラー時に DatabaseError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('boom'));
      await expect(repository.getByTickerAndDate('NSDQ:AAPL', '2026-02-27')).rejects.toThrow(
        DatabaseError
      );
    });
  });

  describe('getByExchangeAndDate', () => {
    it('GSI4 Query（FORECAST# 接頭辞つき）を使う', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [
          {
            PK: 'FORECAST#NSDQ:AAPL',
            SK: 'DATE#2026-02-27',
            Type: 'Forecast',
            TickerID: 'NSDQ:AAPL',
            ExchangeID: 'NASDAQ',
            Market: 'US',
            Date: '2026-02-27',
            AxisValues: {},
            Normal: {},
            Probabilities: {},
            ModelVersion: 'forecast-core-v1',
            Source: 'LIVE',
            CreatedAt: 1_700_000_000_000,
            UpdatedAt: 1_700_000_000_000,
          },
        ],
      });

      const result = await repository.getByExchangeAndDate('NASDAQ', '2026-02-27');
      expect(result).toHaveLength(1);
      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command.input).toMatchObject({
        IndexName: 'ExchangeSummaryIndex',
        ExpressionAttributeValues: {
          ':exchangeId': 'FORECAST#NASDAQ',
          ':datePrefix': 'DATE#2026-02-27',
        },
      });
    });

    it('複数ページを LastEvaluatedKey で連結して取得する', async () => {
      const baseItem = {
        Type: 'Forecast',
        ExchangeID: 'NASDAQ',
        Market: 'US',
        Date: '2026-02-27',
        AxisValues: {},
        Normal: {},
        Probabilities: {},
        ModelVersion: 'forecast-core-v1',
        Source: 'LIVE',
        CreatedAt: 1_700_000_000_000,
        UpdatedAt: 1_700_000_000_000,
      };
      mockDocClient.send
        .mockResolvedValueOnce({
          Items: [{ ...baseItem, PK: 'FORECAST#T1', SK: 'DATE#2026-02-27', TickerID: 'T1' }],
          LastEvaluatedKey: { PK: 'FORECAST#T1', SK: 'DATE#2026-02-27' },
        })
        .mockResolvedValueOnce({
          Items: [{ ...baseItem, PK: 'FORECAST#T2', SK: 'DATE#2026-02-27', TickerID: 'T2' }],
        });

      const result = await repository.getByExchangeAndDate('NASDAQ', '2026-02-27');
      expect(result.map((i) => i.TickerID)).toEqual(['T1', 'T2']);
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);
    });

    it('データベースエラー時に DatabaseError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('boom'));
      await expect(repository.getByExchangeAndDate('NASDAQ', '2026-02-27')).rejects.toThrow(
        DatabaseError
      );
    });
  });

  describe('getSamplesByExchangesAndDateRange', () => {
    const sampleItem = {
      PK: 'FORECAST#NSDQ:AAPL',
      SK: 'DATE#2026-02-27',
      TickerID: 'NSDQ:AAPL',
      ExchangeID: 'NASDAQ',
      Market: 'US',
      Date: '2026-02-27',
      AxisValues: { 'buy-count-ge2': true },
    };

    it('from・to 両方指定時は BETWEEN 条件で Query する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [sampleItem] });

      const result = await repository.getSamplesByExchangesAndDateRange(
        ['NASDAQ'],
        '2026-02-01',
        '2026-02-27'
      );

      expect(result).toEqual([
        {
          tickerId: 'NSDQ:AAPL',
          exchangeId: 'NASDAQ',
          market: 'US',
          date: '2026-02-27',
          axisValues: { 'buy-count-ge2': true },
        },
      ]);
      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command.input).toMatchObject({
        KeyConditionExpression: '#gsi4pk = :exchangeId AND #gsi4sk BETWEEN :from AND :to',
        ProjectionExpression: expect.stringContaining('#probabilities.#dir.#probability'),
        ExpressionAttributeValues: {
          ':exchangeId': 'FORECAST#NASDAQ',
          ':from': 'DATE#2026-02-01',
          ':to': 'DATE#2026-02-27#~',
        },
      });
    });

    it('from のみ指定時は以上条件で Query する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [sampleItem] });

      await repository.getSamplesByExchangesAndDateRange(['NASDAQ'], '2026-02-01');

      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command.input).toMatchObject({
        KeyConditionExpression: '#gsi4pk = :exchangeId AND #gsi4sk >= :from',
        ExpressionAttributeValues: { ':exchangeId': 'FORECAST#NASDAQ', ':from': 'DATE#2026-02-01' },
      });
    });

    it('両方省略時はパーティション全件を Query する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [sampleItem] });

      await repository.getSamplesByExchangesAndDateRange(['NASDAQ']);

      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command.input.KeyConditionExpression).toBe('#gsi4pk = :exchangeId');
    });

    it('複数の取引所をまとめて読み出す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [sampleItem] }).mockResolvedValueOnce({
        Items: [{ ...sampleItem, ExchangeID: 'NYSE', TickerID: 'NYSE:GE' }],
      });

      const result = await repository.getSamplesByExchangesAndDateRange(['NASDAQ', 'NYSE']);
      expect(result).toHaveLength(2);
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);
    });

    it('データベースエラー時に DatabaseError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('boom'));
      await expect(repository.getSamplesByExchangesAndDateRange(['NASDAQ'])).rejects.toThrow(
        DatabaseError
      );
    });
  });
});
