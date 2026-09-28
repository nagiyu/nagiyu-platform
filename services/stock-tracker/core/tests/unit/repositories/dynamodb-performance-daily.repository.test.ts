/**
 * Stock Tracker Core - DynamoDB PerformanceDaily Repository Unit Tests
 *
 * DynamoDBPerformanceDailyRepositoryのユニットテスト
 */
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DatabaseError } from '@nagiyu/aws';
import { DynamoDBPerformanceDailyRepository } from '../../../src/repositories/dynamodb-performance-daily.repository.js';
import type { PerformanceDailyItem } from '../../../src/forecast/index.js';

describe('DynamoDBPerformanceDailyRepository', () => {
  let repository: DynamoDBPerformanceDailyRepository;
  let mockDocClient: jest.Mocked<DynamoDBDocumentClient>;
  const TABLE_NAME = 'test-stock-tracker-table';

  const item: PerformanceDailyItem = {
    question: 'VOL',
    market: 'US',
    date: '2026-02-27',
    evaluatedCount: 30,
    hitCount: 12,
    axisStats: {},
    probabilityBands: [],
    createdAt: 1_700_000_000_000,
  };

  beforeEach(() => {
    mockDocClient = { send: jest.fn() } as unknown as jest.Mocked<DynamoDBDocumentClient>;
    repository = new DynamoDBPerformanceDailyRepository(mockDocClient, TABLE_NAME);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('save', () => {
    it('無条件の PutItem で保存する（冪等な置き換え）', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });
      const result = await repository.save(item);
      expect(result).toEqual(item);
      const command = mockDocClient.send.mock.calls[0][0] as PutCommand;
      expect(command).toBeInstanceOf(PutCommand);
      expect(command.input.ConditionExpression).toBeUndefined();
    });

    it('データベースエラー時に DatabaseError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('boom'));
      await expect(repository.save(item)).rejects.toThrow(DatabaseError);
    });
  });

  describe('getByDate', () => {
    it('GetItem で取得できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'PERF#VOL#US',
          SK: 'DATE#2026-02-27',
          Type: 'PerformanceDaily',
          Question: 'VOL',
          Market: 'US',
          Date: '2026-02-27',
          EvaluatedCount: 30,
          HitCount: 12,
          AxisStats: {},
          ProbabilityBands: [],
          CreatedAt: 1_700_000_000_000,
          UpdatedAt: 1_700_000_000_000,
        },
      });
      const result = await repository.getByDate('VOL', 'US', '2026-02-27');
      expect(result?.evaluatedCount).toBe(30);
      expect(mockDocClient.send.mock.calls[0][0]).toBeInstanceOf(GetCommand);
    });

    it('存在しない場合は null を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: undefined });
      expect(await repository.getByDate('VOL', 'US', '2026-02-27')).toBeNull();
    });

    it('データベースエラー時に DatabaseError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('boom'));
      await expect(repository.getByDate('VOL', 'US', '2026-02-27')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getByPeriod', () => {
    const dbItem = {
      PK: 'PERF#VOL#US',
      SK: 'DATE#2026-02-27',
      Type: 'PerformanceDaily',
      Question: 'VOL',
      Market: 'US',
      Date: '2026-02-27',
      EvaluatedCount: 30,
      HitCount: 12,
      AxisStats: {},
      ProbabilityBands: [],
      CreatedAt: 1_700_000_000_000,
      UpdatedAt: 1_700_000_000_000,
    };

    it('toDate 指定時は BETWEEN 条件で Query する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [dbItem] });
      const result = await repository.getByPeriod('VOL', 'US', '2026-02-01', '2026-02-27');
      expect(result).toHaveLength(1);
      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command.input).toMatchObject({
        KeyConditionExpression: '#pk = :pk AND #sk BETWEEN :from AND :to',
        ExpressionAttributeValues: {
          ':pk': 'PERF#VOL#US',
          ':from': 'DATE#2026-02-01',
          ':to': 'DATE#2026-02-27#~',
        },
      });
    });

    it('toDate 省略時は以上条件で Query する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [dbItem] });
      await repository.getByPeriod('VOL', 'US', '2026-02-01');
      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command.input.KeyConditionExpression).toBe('#pk = :pk AND #sk >= :from');
    });

    it('複数ページを LastEvaluatedKey で連結する', async () => {
      mockDocClient.send
        .mockResolvedValueOnce({
          Items: [dbItem],
          LastEvaluatedKey: { PK: dbItem.PK, SK: dbItem.SK },
        })
        .mockResolvedValueOnce({
          Items: [{ ...dbItem, Date: '2026-02-28', SK: 'DATE#2026-02-28' }],
        });

      const result = await repository.getByPeriod('VOL', 'US', '2026-02-01');
      expect(result).toHaveLength(2);
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);
    });

    it('データベースエラー時に DatabaseError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('boom'));
      await expect(repository.getByPeriod('VOL', 'US', '2026-02-01')).rejects.toThrow(
        DatabaseError
      );
    });
  });
});
