/**
 * Stock Tracker Core - DynamoDB MarketForecast Repository Unit Tests
 *
 * DynamoDBMarketForecastRepositoryのユニットテスト
 */
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DatabaseError, EntityNotFoundError } from '@nagiyu/aws';
import { DynamoDBMarketForecastRepository } from '../../../src/repositories/dynamodb-market-forecast.repository.js';
import type { CreateMarketForecastInput } from '../../../src/entities/market-forecast.entity.js';
import type { MarketOutcome } from '../../../src/forecast/index.js';

describe('DynamoDBMarketForecastRepository', () => {
  let repository: DynamoDBMarketForecastRepository;
  let mockDocClient: jest.Mocked<DynamoDBDocumentClient>;
  const TABLE_NAME = 'test-stock-tracker-table';

  const createInput: CreateMarketForecastInput = {
    Market: 'US',
    Date: '2026-02-27',
    AxisValues: { 'market-range-avg': 0.1 },
    Probabilities: {},
    ModelVersion: 'forecast-core-v1',
    Source: 'LIVE',
  };

  beforeEach(() => {
    mockDocClient = { send: jest.fn() } as unknown as jest.Mocked<DynamoDBDocumentClient>;
    repository = new DynamoDBMarketForecastRepository(mockDocClient, TABLE_NAME);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('createIfAbsent', () => {
    it('条件付き PutItem で新規作成する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });
      const result = await repository.createIfAbsent(createInput);
      expect(result.created).toBe(true);
      const command = mockDocClient.send.mock.calls[0][0] as PutCommand;
      expect(command).toBeInstanceOf(PutCommand);
      expect(command.input).toMatchObject({ ConditionExpression: 'attribute_not_exists(PK)' });
    });

    it('既に存在する場合は既存のアイテムを created:false で返す', async () => {
      const conditionalError = new Error('The conditional request failed');
      conditionalError.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(conditionalError).mockResolvedValueOnce({
        Item: {
          PK: 'MARKETFORECAST#US',
          SK: 'DATE#2026-02-27',
          Type: 'MarketForecast',
          Market: 'US',
          Date: '2026-02-27',
          AxisValues: {},
          Probabilities: {},
          ModelVersion: 'forecast-core-v1',
          Source: 'LIVE',
          CreatedAt: 1_700_000_000_000,
          UpdatedAt: 1_700_000_000_000,
        },
      });

      const result = await repository.createIfAbsent(createInput);
      expect(result.created).toBe(false);
    });

    it('データベースエラー時に DatabaseError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('boom'));
      await expect(repository.createIfAbsent(createInput)).rejects.toThrow(DatabaseError);
    });
  });

  describe('appendOutcome', () => {
    const outcome: MarketOutcome = {
      market: 'US',
      date: '2026-02-27',
      nextDate: '2026-02-28',
      nextRange: 0.09,
      rangeRatio: 1.05,
      hit: { MKT: true },
      evaluatedAt: 1_700_100_000_000,
    };

    it('条件付き UpdateItem で Outcome を追記する', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: {
          PK: 'MARKETFORECAST#US',
          SK: 'DATE#2026-02-27',
          Type: 'MarketForecast',
          Market: 'US',
          Date: '2026-02-27',
          AxisValues: {},
          Probabilities: {},
          ModelVersion: 'forecast-core-v1',
          Source: 'LIVE',
          Outcome: { nextDate: '2026-02-28', hit: { MKT: true }, evaluatedAt: 1_700_100_000_000 },
          CreatedAt: 1_700_000_000_000,
          UpdatedAt: 1_700_100_000_000,
        },
      });

      const result = await repository.appendOutcome({ market: 'US', date: '2026-02-27' }, outcome);
      expect(result.updated).toBe(true);
      expect(mockDocClient.send.mock.calls[0][0]).toBeInstanceOf(UpdateCommand);
    });

    it('既に Outcome がある場合は updated:false を返す', async () => {
      const conditionalError = new Error('The conditional request failed');
      conditionalError.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(conditionalError).mockResolvedValueOnce({
        Item: {
          PK: 'MARKETFORECAST#US',
          SK: 'DATE#2026-02-27',
          Type: 'MarketForecast',
          Market: 'US',
          Date: '2026-02-27',
          AxisValues: {},
          Probabilities: {},
          ModelVersion: 'forecast-core-v1',
          Source: 'LIVE',
          Outcome: { nextDate: '2026-02-28', hit: { MKT: false }, evaluatedAt: 1_699_000_000_000 },
          CreatedAt: 1_700_000_000_000,
          UpdatedAt: 1_699_000_000_000,
        },
      });

      const result = await repository.appendOutcome({ market: 'US', date: '2026-02-27' }, outcome);
      expect(result.updated).toBe(false);
    });

    it('対象 MarketForecast が存在しない場合は EntityNotFoundError をスローする', async () => {
      const conditionalError = new Error('The conditional request failed');
      conditionalError.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(conditionalError).mockResolvedValueOnce({
        Item: undefined,
      });

      await expect(
        repository.appendOutcome({ market: 'US', date: '2026-02-27' }, outcome)
      ).rejects.toBeInstanceOf(EntityNotFoundError);
    });

    it('その他のデータベースエラーは DatabaseError に変換される', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('boom'));
      await expect(
        repository.appendOutcome({ market: 'US', date: '2026-02-27' }, outcome)
      ).rejects.toThrow(DatabaseError);
    });
  });

  describe('getByMarketAndDate', () => {
    it('GetItem で取得できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'MARKETFORECAST#US',
          SK: 'DATE#2026-02-27',
          Type: 'MarketForecast',
          Market: 'US',
          Date: '2026-02-27',
          AxisValues: {},
          Probabilities: {},
          ModelVersion: 'forecast-core-v1',
          Source: 'LIVE',
          CreatedAt: 1_700_000_000_000,
          UpdatedAt: 1_700_000_000_000,
        },
      });
      const result = await repository.getByMarketAndDate('US', '2026-02-27');
      expect(result?.Market).toBe('US');
      expect(mockDocClient.send.mock.calls[0][0]).toBeInstanceOf(GetCommand);
    });

    it('存在しない場合は null を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: undefined });
      expect(await repository.getByMarketAndDate('US', '2026-02-27')).toBeNull();
    });

    it('データベースエラー時に DatabaseError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('boom'));
      await expect(repository.getByMarketAndDate('US', '2026-02-27')).rejects.toThrow(
        DatabaseError
      );
    });
  });

  describe('getSamplesByDateRange', () => {
    const item = {
      PK: 'MARKETFORECAST#US',
      SK: 'DATE#2026-02-27',
      Market: 'US',
      Date: '2026-02-27',
      AxisValues: { 'market-range-avg': 0.1 },
    };

    it('from・to 両方指定時は BETWEEN 条件で Query する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [item] });
      const result = await repository.getSamplesByDateRange('US', '2026-02-01', '2026-02-27');
      expect(result).toEqual([{ market: 'US', date: '2026-02-27', axisValues: item.AxisValues }]);
      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command.input).toMatchObject({
        KeyConditionExpression: '#pk = :pk AND #sk BETWEEN :from AND :to',
        ExpressionAttributeValues: {
          ':pk': 'MARKETFORECAST#US',
          ':from': 'DATE#2026-02-01',
          ':to': 'DATE#2026-02-27#~',
        },
      });
    });

    it('両方省略時は市場の全件を Query する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [item] });
      await repository.getSamplesByDateRange('US');
      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command.input.KeyConditionExpression).toBe('#pk = :pk');
    });

    it('複数ページを LastEvaluatedKey で連結する', async () => {
      mockDocClient.send
        .mockResolvedValueOnce({ Items: [item], LastEvaluatedKey: { PK: item.PK, SK: item.SK } })
        .mockResolvedValueOnce({ Items: [{ ...item, Date: '2026-02-28', SK: 'DATE#2026-02-28' }] });

      const result = await repository.getSamplesByDateRange('US');
      expect(result).toHaveLength(2);
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);
    });

    it('データベースエラー時に DatabaseError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('boom'));
      await expect(repository.getSamplesByDateRange('US')).rejects.toThrow(DatabaseError);
    });
  });
});
