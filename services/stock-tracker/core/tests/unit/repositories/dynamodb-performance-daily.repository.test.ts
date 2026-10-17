/**
 * Stock Tracker Core - DynamoDB PerformanceDaily Repository Unit Tests
 *
 * DynamoDBPerformanceDailyRepositoryのユニットテスト
 *
 * 単一アイテムの保存・取得の振る舞い (条件式・エラー変換など) は EntityStore の責務のため、
 * ここでは save の書き込み内容と、期間の Query だけを検証する。
 */
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DatabaseError, InvalidEntityDataError } from '@nagiyu/aws';
import { DynamoDBPerformanceDailyRepository } from '../../../src/repositories/dynamodb-performance-daily.repository.js';
import type { PerformanceDailyItem } from '../../../src/forecast/index.js';

const NOW = 1_700_100_000_000;
const CREATED_AT = 1_700_000_000_000;

const item: PerformanceDailyItem = {
  question: 'VOL',
  market: 'US',
  date: '2026-02-27',
  evaluatedCount: 30,
  hitCount: 12,
  axisStats: {},
  probabilityBands: [],
  createdAt: CREATED_AT,
};

function buildDbItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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
    CreatedAt: CREATED_AT,
    UpdatedAt: CREATED_AT,
    ...overrides,
  };
}

describe('DynamoDBPerformanceDailyRepository', () => {
  let repository: DynamoDBPerformanceDailyRepository;
  let mockDocClient: jest.Mocked<DynamoDBDocumentClient>;
  const TABLE_NAME = 'test-stock-tracker-table';

  beforeEach(() => {
    // UpdatedAt は EntityStore が現在時刻で書くため、時刻を固定して検証する
    jest.useFakeTimers().setSystemTime(NOW);
    mockDocClient = { send: jest.fn() } as unknown as jest.Mocked<DynamoDBDocumentClient>;
    repository = new DynamoDBPerformanceDailyRepository(mockDocClient, TABLE_NAME);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('save', () => {
    it('保存形式の Item を無条件の PutItem で書き込み、保存した値を返す（冪等な置き換え）', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      const result = await repository.save(item);

      expect(result).toEqual(item);
      const command = mockDocClient.send.mock.calls[0][0] as PutCommand;
      expect(command).toBeInstanceOf(PutCommand);
      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        Item: buildDbItem({ UpdatedAt: NOW }),
      });
      expect(command.input.ConditionExpression).toBeUndefined();
    });

    it('データベースエラー時に DatabaseError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('boom'));

      await expect(repository.save(item)).rejects.toThrow(DatabaseError);
    });
  });

  describe('getByDate', () => {
    it('問い・市場・日付から組み立てたキーで取得し、Entity として返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: buildDbItem() });

      const result = await repository.getByDate('VOL', 'US', '2026-02-27');

      expect(result).toEqual(item);
      const command = mockDocClient.send.mock.calls[0][0] as GetCommand;
      expect(command).toBeInstanceOf(GetCommand);
      expect(command.input.Key).toEqual({ PK: 'PERF#VOL#US', SK: 'DATE#2026-02-27' });
    });

    it('存在しない場合は null を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: undefined });

      expect(await repository.getByDate('VOL', 'US', '2026-02-27')).toBeNull();
    });
  });

  describe('getByPeriod', () => {
    const dbItem = buildDbItem();

    it('toDate 指定時は BETWEEN 条件で Query する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [dbItem] });

      const result = await repository.getByPeriod('VOL', 'US', '2026-02-01', '2026-02-27');

      expect(result).toEqual([item]);
      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        KeyConditionExpression: '#pk = :pk AND #sk BETWEEN :from AND :to',
        ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
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
      expect(command.input.ExpressionAttributeValues).toEqual({
        ':pk': 'PERF#VOL#US',
        ':from': 'DATE#2026-02-01',
      });
    });

    it('複数ページを LastEvaluatedKey で連結する', async () => {
      const lastKey = { PK: 'PERF#VOL#US', SK: 'DATE#2026-02-27' };
      mockDocClient.send
        .mockResolvedValueOnce({ Items: [dbItem], LastEvaluatedKey: lastKey })
        .mockResolvedValueOnce({
          Items: [buildDbItem({ Date: '2026-02-28', SK: 'DATE#2026-02-28' })],
        });

      const result = await repository.getByPeriod('VOL', 'US', '2026-02-01');

      expect(result.map((i) => i.date)).toEqual(['2026-02-27', '2026-02-28']);
      const second = mockDocClient.send.mock.calls[1][0] as QueryCommand;
      expect(second.input.ExclusiveStartKey).toEqual(lastKey);
    });

    it('読めないアイテムが含まれるときは InvalidEntityDataError をスローする', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [dbItem, buildDbItem({ ProbabilityBands: 'broken' })],
      });

      await expect(repository.getByPeriod('VOL', 'US', '2026-02-01')).rejects.toThrow(
        InvalidEntityDataError
      );
    });

    it('データベースエラー時に DatabaseError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('boom'));

      await expect(repository.getByPeriod('VOL', 'US', '2026-02-01')).rejects.toThrow(
        DatabaseError
      );
    });
  });
});
