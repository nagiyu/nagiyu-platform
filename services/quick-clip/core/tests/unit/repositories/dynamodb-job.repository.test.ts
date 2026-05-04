import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DynamoDBJobRepository } from '../../../src/repositories/dynamodb-job.repository.js';

describe('DynamoDBJobRepository', () => {
  const TABLE_NAME = 'test-table';
  let mockSend: jest.Mock;
  let mockDocClient: DynamoDBDocumentClient;
  let repository: DynamoDBJobRepository;

  beforeEach(() => {
    mockSend = jest.fn();
    mockDocClient = {
      send: mockSend,
    } as unknown as DynamoDBDocumentClient;
    repository = new DynamoDBJobRepository(mockDocClient, TABLE_NAME);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('create はジョブをテーブルに保存する', async () => {
    mockSend.mockResolvedValue({});

    const job = {
      jobId: 'job-1',
      originalFileName: 'movie.mp4',
      fileSize: 1024,
      createdAt: 1000000,
      expiresAt: 1086400,
    };

    const result = await repository.create(job);

    const sentCommand = mockSend.mock.calls[0]?.[0] as PutCommand;
    expect(sentCommand).toBeInstanceOf(PutCommand);
    expect(sentCommand.input.Item).toMatchObject({
      PK: 'JOB#job-1',
      SK: 'JOB#job-1',
      Type: 'JOB',
      jobId: 'job-1',
      originalFileName: 'movie.mp4',
      fileSize: 1024,
      createdAt: 1000000,
      expiresAt: 1086400,
    });
    expect(sentCommand.input.Item).not.toHaveProperty('status');
    expect(result).toEqual(job);
  });

  it('getById はジョブを取得して Job エンティティに変換する', async () => {
    mockSend.mockResolvedValue({
      Item: {
        PK: 'JOB#job-1',
        SK: 'JOB#job-1',
        Type: 'JOB',
        jobId: 'job-1',
        batchJobId: 'batch-abc-123',
        batchStage: 'analyzing',
        originalFileName: 'movie.mp4',
        fileSize: 2048,
        createdAt: 1000000,
        expiresAt: 1086400,
      },
    });

    const result = await repository.getById('job-1');

    const sentCommand = mockSend.mock.calls[0]?.[0] as GetCommand;
    expect(sentCommand).toBeInstanceOf(GetCommand);
    expect(result).toEqual({
      jobId: 'job-1',
      batchJobId: 'batch-abc-123',
      batchStage: 'analyzing',
      originalFileName: 'movie.mp4',
      fileSize: 2048,
      createdAt: 1000000,
      expiresAt: 1086400,
    });
  });

  it('getById はアイテムが存在しない場合 null を返す', async () => {
    mockSend.mockResolvedValue({ Item: undefined });

    const result = await repository.getById('non-existent');

    expect(result).toBeNull();
  });

  it('updateBatchJobId は batchJobId を更新する', async () => {
    mockSend.mockResolvedValue({});

    await repository.updateBatchJobId('job-1', 'batch-abc-123');

    const sentCommand = mockSend.mock.calls[0]?.[0] as UpdateCommand;
    expect(sentCommand).toBeInstanceOf(UpdateCommand);
    expect(sentCommand.input.UpdateExpression).toContain('#batchJobId = :batchJobId');
    expect(sentCommand.input.ExpressionAttributeNames).toMatchObject({
      '#batchJobId': 'batchJobId',
    });
    expect(sentCommand.input.ExpressionAttributeValues).toMatchObject({
      ':batchJobId': 'batch-abc-123',
    });
  });

  it('updateBatchStage は batchStage を更新する', async () => {
    mockSend.mockResolvedValue({});

    await repository.updateBatchStage('job-1', 'downloading');

    const sentCommand = mockSend.mock.calls[0]?.[0] as UpdateCommand;
    expect(sentCommand).toBeInstanceOf(UpdateCommand);
    expect(sentCommand.input.UpdateExpression).toContain('#batchStage = :batchStage');
    expect(sentCommand.input.ExpressionAttributeNames).toMatchObject({
      '#batchStage': 'batchStage',
    });
    expect(sentCommand.input.ExpressionAttributeValues).toMatchObject({
      ':batchStage': 'downloading',
    });
  });

  it('updateErrorMessage は errorMessage を更新する', async () => {
    mockSend.mockResolvedValue({});

    await repository.updateErrorMessage('job-1', '解析に失敗しました');

    const sentCommand = mockSend.mock.calls[0]?.[0] as UpdateCommand;
    expect(sentCommand).toBeInstanceOf(UpdateCommand);
    expect(sentCommand.input.UpdateExpression).toContain('#errorMessage = :errorMessage');
    expect(sentCommand.input.ExpressionAttributeNames).toMatchObject({
      '#errorMessage': 'errorMessage',
    });
    expect(sentCommand.input.ExpressionAttributeValues).toMatchObject({
      ':errorMessage': '解析に失敗しました',
    });
  });

  it('updateAnalysisProgress は analysisProgress を更新する', async () => {
    mockSend.mockResolvedValue({});

    const progress = {
      motion: { status: 'done' as const },
      volume: { status: 'in_progress' as const },
    };

    await repository.updateAnalysisProgress('job-1', progress);

    const sentCommand = mockSend.mock.calls[0]?.[0] as UpdateCommand;
    expect(sentCommand).toBeInstanceOf(UpdateCommand);
    expect(sentCommand.input.UpdateExpression).toContain('#analysisProgress = :analysisProgress');
    expect(sentCommand.input.ExpressionAttributeNames).toMatchObject({
      '#analysisProgress': 'analysisProgress',
    });
    expect(sentCommand.input.ExpressionAttributeValues).toMatchObject({
      ':analysisProgress': progress,
    });
  });

  it('getById は analysisProgress フィールドを含むジョブを返す', async () => {
    const progress = {
      motion: { status: 'done' },
      volume: { status: 'done' },
      transcription: { status: 'in_progress', completed: 1, total: 3 },
    };
    mockSend.mockResolvedValue({
      Item: {
        PK: 'JOB#job-2',
        SK: 'JOB#job-2',
        Type: 'JOB',
        jobId: 'job-2',
        originalFileName: 'video.mp4',
        fileSize: 1024,
        createdAt: 1000000,
        expiresAt: 1086400,
        analysisProgress: progress,
      },
    });

    const result = await repository.getById('job-2');

    expect(result?.analysisProgress).toEqual(progress);
  });
});
