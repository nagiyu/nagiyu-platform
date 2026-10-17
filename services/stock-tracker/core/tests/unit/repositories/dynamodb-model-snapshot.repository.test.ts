/**
 * Stock Tracker Core - DynamoDB ModelSnapshot Repository Unit Tests
 *
 * DynamoDBModelSnapshotRepositoryのユニットテスト
 *
 * 単一アイテムの作成・取得の振る舞い (条件式・エラー変換など) は EntityStore の責務のため、
 * ここでは createIfAbsent の「既存を返す」扱いと、直前のスナップショットを探す Query だけを検証する。
 */
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DatabaseError, InvalidEntityDataError, RepositoryError } from '@nagiyu/aws';
import { DynamoDBModelSnapshotRepository } from '../../../src/repositories/dynamodb-model-snapshot.repository.js';
import type { ModelSnapshotItem } from '../../../src/forecast/index.js';

const NOW = 1_700_100_000_000;
const CREATED_AT = 1_700_000_000_000;

const item: ModelSnapshotItem = {
  question: 'DIR',
  market: 'US',
  date: '2026-02-27',
  modelVersion: 'forecast-core-v1',
  alpha: 80,
  weights: {},
  standardization: {},
  baseline: 0.5,
  neutralBand: { lower: -1, upper: 1, decidedOn: '2026-02-01' },
  bandHistory: [],
  axisStats: {},
  trainingSize: 100,
  distinctTrainingDates: 50,
  createdAt: CREATED_AT,
};

function buildDbItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'MODEL#DIR#US',
    SK: 'DATE#2026-02-27',
    Type: 'ModelSnapshot',
    Question: 'DIR',
    Market: 'US',
    Date: '2026-02-27',
    ModelVersion: 'forecast-core-v1',
    Alpha: 80,
    Weights: {},
    Standardization: {},
    Baseline: 0.5,
    NeutralBand: { lower: -1, upper: 1, decidedOn: '2026-02-01' },
    BandHistory: [],
    AxisStats: {},
    TrainingSize: 100,
    DistinctTrainingDates: 50,
    CreatedAt: CREATED_AT,
    UpdatedAt: CREATED_AT,
    ...overrides,
  };
}

function conditionalCheckFailed(): Error {
  const error = new Error('The conditional request failed');
  error.name = 'ConditionalCheckFailedException';
  return error;
}

describe('DynamoDBModelSnapshotRepository', () => {
  let repository: DynamoDBModelSnapshotRepository;
  let mockDocClient: jest.Mocked<DynamoDBDocumentClient>;
  const TABLE_NAME = 'test-stock-tracker-table';

  beforeEach(() => {
    // UpdatedAt は EntityStore が現在時刻で書くため、時刻を固定して検証する
    jest.useFakeTimers().setSystemTime(NOW);
    mockDocClient = { send: jest.fn() } as unknown as jest.Mocked<DynamoDBDocumentClient>;
    repository = new DynamoDBModelSnapshotRepository(mockDocClient, TABLE_NAME);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('createIfAbsent', () => {
    it('未作成なら保存形式の Item を書き込み、created:true で返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      const result = await repository.createIfAbsent(item);

      expect(result).toEqual({ item, created: true });
      const command = mockDocClient.send.mock.calls[0][0] as PutCommand;
      expect(command).toBeInstanceOf(PutCommand);
      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        Item: buildDbItem({ UpdatedAt: NOW }),
      });
    });

    it('既存の Item を書き換えないよう、存在しないときだけ書く条件を付ける', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      await repository.createIfAbsent(item);

      const command = mockDocClient.send.mock.calls[0][0] as PutCommand;
      expect(command.input.ConditionExpression).toBe('attribute_not_exists(#pk)');
      expect(command.input.ExpressionAttributeNames).toEqual({ '#pk': 'PK' });
    });

    it('既に存在する場合は書き込まず、既存のアイテムを created:false で返す', async () => {
      mockDocClient.send
        .mockRejectedValueOnce(conditionalCheckFailed())
        .mockResolvedValueOnce({ Item: buildDbItem({ Baseline: 0.7 }) });

      const result = await repository.createIfAbsent(item);

      expect(result.created).toBe(false);
      expect(result.item.baseline).toBe(0.7);
      expect(mockDocClient.send.mock.calls[1][0]).toBeInstanceOf(GetCommand);
    });

    it('既存が読めないときは InvalidEntityDataError をスローする', async () => {
      mockDocClient.send
        .mockRejectedValueOnce(conditionalCheckFailed())
        .mockResolvedValueOnce({ Item: buildDbItem({ Weights: 'broken' }) });

      await expect(repository.createIfAbsent(item)).rejects.toThrow(InvalidEntityDataError);
    });

    it('作成が衝突したのに既存が見つからないときは RepositoryError 派生の DatabaseError をスローする', async () => {
      mockDocClient.send
        .mockRejectedValueOnce(conditionalCheckFailed())
        .mockResolvedValueOnce({ Item: undefined });

      const promise = repository.createIfAbsent(item);

      await expect(promise).rejects.toThrow(DatabaseError);
      await expect(promise).rejects.toBeInstanceOf(RepositoryError);
    });

    it('その他のデータベースエラーは DatabaseError のままスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('boom'));

      await expect(repository.createIfAbsent(item)).rejects.toThrow(DatabaseError);
    });
  });

  describe('getByDate', () => {
    it('問い・市場・日付から組み立てたキーで取得し、Entity として返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: buildDbItem() });

      const result = await repository.getByDate('DIR', 'US', '2026-02-27');

      expect(result).toEqual(item);
      const command = mockDocClient.send.mock.calls[0][0] as GetCommand;
      expect(command).toBeInstanceOf(GetCommand);
      expect(command.input.Key).toEqual({ PK: 'MODEL#DIR#US', SK: 'DATE#2026-02-27' });
    });

    it('存在しない場合は null を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: undefined });

      expect(await repository.getByDate('DIR', 'US', '2026-02-27')).toBeNull();
    });
  });

  describe('getLatestBefore', () => {
    it('SK 降順・Limit 1 の Query で最新 1 件を取得する', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [buildDbItem({ SK: 'DATE#2026-02-26', Date: '2026-02-26' })],
      });

      const result = await repository.getLatestBefore('DIR', 'US', '2026-02-27');

      expect(result?.date).toBe('2026-02-26');
      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command).toBeInstanceOf(QueryCommand);
      expect(command.input).toEqual({
        TableName: TABLE_NAME,
        KeyConditionExpression: '#pk = :pk AND #sk < :date',
        ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
        ExpressionAttributeValues: { ':pk': 'MODEL#DIR#US', ':date': 'DATE#2026-02-27' },
        ScanIndexForward: false,
        Limit: 1,
      });
    });

    it('該当が無い場合は null を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [] });

      expect(await repository.getLatestBefore('DIR', 'US', '2026-02-27')).toBeNull();
    });

    it('Items が返らない場合も null を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({});

      expect(await repository.getLatestBefore('DIR', 'US', '2026-02-27')).toBeNull();
    });

    it('最新のアイテムが読めないときは InvalidEntityDataError をスローする', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [buildDbItem({ Weights: 'broken' })] });

      await expect(repository.getLatestBefore('DIR', 'US', '2026-02-28')).rejects.toThrow(
        InvalidEntityDataError
      );
    });

    it('データベースエラー時に DatabaseError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('boom'));

      await expect(repository.getLatestBefore('DIR', 'US', '2026-02-27')).rejects.toThrow(
        DatabaseError
      );
    });
  });
});
