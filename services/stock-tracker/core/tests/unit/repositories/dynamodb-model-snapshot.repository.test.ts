/**
 * Stock Tracker Core - DynamoDB ModelSnapshot Repository Unit Tests
 *
 * DynamoDBModelSnapshotRepositoryのユニットテスト
 */
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DatabaseError } from '@nagiyu/aws';
import { DynamoDBModelSnapshotRepository } from '../../../src/repositories/dynamodb-model-snapshot.repository.js';
import type { ModelSnapshotItem } from '../../../src/forecast/index.js';

describe('DynamoDBModelSnapshotRepository', () => {
  let repository: DynamoDBModelSnapshotRepository;
  let mockDocClient: jest.Mocked<DynamoDBDocumentClient>;
  const TABLE_NAME = 'test-stock-tracker-table';

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
    createdAt: 1_700_000_000_000,
  };

  beforeEach(() => {
    mockDocClient = { send: jest.fn() } as unknown as jest.Mocked<DynamoDBDocumentClient>;
    repository = new DynamoDBModelSnapshotRepository(mockDocClient, TABLE_NAME);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('createIfAbsent', () => {
    it('条件付き PutItem で新規作成する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });
      const result = await repository.createIfAbsent(item);
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
          CreatedAt: 1_700_000_000_000,
          UpdatedAt: 1_700_000_000_000,
        },
      });

      const result = await repository.createIfAbsent(item);
      expect(result.created).toBe(false);
    });

    it('データベースエラー時に DatabaseError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('boom'));
      await expect(repository.createIfAbsent(item)).rejects.toThrow(DatabaseError);
    });
  });

  describe('getByDate', () => {
    it('GetItem で取得できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
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
          CreatedAt: 1_700_000_000_000,
          UpdatedAt: 1_700_000_000_000,
        },
      });
      const result = await repository.getByDate('DIR', 'US', '2026-02-27');
      expect(result?.question).toBe('DIR');
      expect(mockDocClient.send.mock.calls[0][0]).toBeInstanceOf(GetCommand);
    });

    it('存在しない場合は null を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: undefined });
      expect(await repository.getByDate('DIR', 'US', '2026-02-27')).toBeNull();
    });

    it('データベースエラー時に DatabaseError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('boom'));
      await expect(repository.getByDate('DIR', 'US', '2026-02-27')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getLatestBefore', () => {
    it('SK 降順・Limit 1 の Query で最新 1 件を取得する', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [
          {
            PK: 'MODEL#DIR#US',
            SK: 'DATE#2026-02-26',
            Type: 'ModelSnapshot',
            Question: 'DIR',
            Market: 'US',
            Date: '2026-02-26',
            ModelVersion: 'forecast-core-v1',
            Alpha: 80,
            Weights: {},
            Standardization: {},
            Baseline: 0.5,
            NeutralBand: { lower: -1, upper: 1, decidedOn: '2026-02-01' },
            BandHistory: [],
            AxisStats: {},
            TrainingSize: 90,
            DistinctTrainingDates: 45,
            CreatedAt: 1_699_900_000_000,
            UpdatedAt: 1_699_900_000_000,
          },
        ],
      });

      const result = await repository.getLatestBefore('DIR', 'US', '2026-02-27');
      expect(result?.date).toBe('2026-02-26');
      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command.input).toMatchObject({
        KeyConditionExpression: '#pk = :pk AND #sk < :date',
        ExpressionAttributeValues: { ':pk': 'MODEL#DIR#US', ':date': 'DATE#2026-02-27' },
        ScanIndexForward: false,
        Limit: 1,
      });
    });

    it('該当が無い場合は null を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [] });
      expect(await repository.getLatestBefore('DIR', 'US', '2026-02-27')).toBeNull();
    });

    it('データベースエラー時に DatabaseError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('boom'));
      await expect(repository.getLatestBefore('DIR', 'US', '2026-02-27')).rejects.toThrow(
        DatabaseError
      );
    });
  });
});
