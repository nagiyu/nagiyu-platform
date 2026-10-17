/**
 * 単一アイテムの CRUD の振る舞い (エラー変換など) は EntityStore の責務のため、
 * ここでは正しいキーと保存形式で委譲していることを検証する。
 */
import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { EntityNotFoundError } from '@nagiyu/aws';
import { DynamoDBJobRepository } from '../../../src/repositories/dynamodb-job.repository.js';
import { parseUpdateExpression } from '../../helpers/update-expression.js';

const NOW = 1704067300000;
const CREATED_AT = 1704067200000;
const EXPIRES_AT = 1704153600000;

function buildItem(overrides: Record<string, unknown> = {}) {
  return {
    PK: 'JOB#job-1',
    SK: 'JOB#job-1',
    Type: 'JOB',
    JobID: 'job-1',
    OriginalFileName: 'movie.mp4',
    FileSize: 1024,
    CreatedAt: CREATED_AT,
    TTL: EXPIRES_AT / 1000,
    UpdatedAt: CREATED_AT,
    ...overrides,
  };
}

function conditionalCheckFailed(): Error {
  const error = new Error('Conditional check failed');
  error.name = 'ConditionalCheckFailedException';
  return error;
}

describe('DynamoDBJobRepository', () => {
  const TABLE_NAME = 'test-table';
  let mockSend: jest.Mock;
  let repository: DynamoDBJobRepository;

  beforeEach(() => {
    // UpdatedAt は EntityStore が現在時刻で書くため、時刻を固定して検証する
    jest.useFakeTimers().setSystemTime(NOW);
    mockSend = jest.fn();
    repository = new DynamoDBJobRepository(
      { send: mockSend } as unknown as DynamoDBDocumentClient,
      TABLE_NAME
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('create は保存形式の Item として書き込み、Entity を返す', async () => {
    mockSend.mockResolvedValue({});
    const job = {
      jobId: 'job-1',
      originalFileName: 'movie.mp4',
      fileSize: 1024,
      durationSec: 60,
      createdAt: CREATED_AT,
      expiresAt: EXPIRES_AT,
    };

    const result = await repository.create(job);

    expect(result).toEqual(job);
    const command = mockSend.mock.calls[0]?.[0] as PutCommand;
    expect(command).toBeInstanceOf(PutCommand);
    expect(command.input.TableName).toBe(TABLE_NAME);
    expect(command.input.Item).toEqual({
      PK: 'JOB#job-1',
      SK: 'JOB#job-1',
      Type: 'JOB',
      JobID: 'job-1',
      OriginalFileName: 'movie.mp4',
      FileSize: 1024,
      DurationSec: 60,
      CreatedAt: CREATED_AT,
      TTL: EXPIRES_AT / 1000,
      UpdatedAt: NOW,
    });
  });

  it('getById は存在するジョブを Entity として返す', async () => {
    mockSend.mockResolvedValue({ Item: buildItem({ BatchJobID: 'batch-1' }) });

    const result = await repository.getById('job-1');

    const command = mockSend.mock.calls[0]?.[0] as GetCommand;
    expect(command).toBeInstanceOf(GetCommand);
    expect(command.input.Key).toEqual({ PK: 'JOB#job-1', SK: 'JOB#job-1' });
    expect(result).toEqual({
      jobId: 'job-1',
      originalFileName: 'movie.mp4',
      fileSize: 1024,
      createdAt: CREATED_AT,
      expiresAt: EXPIRES_AT,
      batchJobId: 'batch-1',
    });
  });

  it('getById は旧形式 (camelCase・エポック秒・expiresAt) のジョブも読める', async () => {
    mockSend.mockResolvedValue({
      Item: {
        PK: 'JOB#job-1',
        SK: 'JOB#job-1',
        Type: 'JOB',
        jobId: 'job-1',
        originalFileName: 'movie.mp4',
        fileSize: 1024,
        createdAt: CREATED_AT / 1000,
        expiresAt: EXPIRES_AT / 1000,
      },
    });

    const result = await repository.getById('job-1');

    expect(result).toMatchObject({ jobId: 'job-1', createdAt: CREATED_AT, expiresAt: EXPIRES_AT });
  });

  it('getById は存在しなければ null を返す', async () => {
    mockSend.mockResolvedValue({});

    expect(await repository.getById('missing')).toBeNull();
  });

  it.each([
    [
      'updateBatchJobId',
      (r: DynamoDBJobRepository) => r.updateBatchJobId('job-1', 'b-1'),
      {
        BatchJobID: 'b-1',
      },
      ['batchJobId'],
    ],
    [
      'updateBatchStage',
      (r: DynamoDBJobRepository) => r.updateBatchStage('job-1', 'clipping'),
      {
        BatchStage: 'clipping',
      },
      ['batchStage'],
    ],
    [
      'updateErrorMessage',
      (r: DynamoDBJobRepository) => r.updateErrorMessage('job-1', 'err'),
      {
        ErrorMessage: 'err',
      },
      ['errorMessage'],
    ],
    [
      'updateAnalysisProgress',
      (r: DynamoDBJobRepository) =>
        r.updateAnalysisProgress('job-1', {
          motion: { status: 'done' },
          volume: { status: 'in_progress' },
        }),
      { AnalysisProgress: { motion: { status: 'done' }, volume: { status: 'in_progress' } } },
      ['analysisProgress'],
    ],
  ])('%s は新属性名で SET し、旧属性名を REMOVE する', async (_name, run, set, remove) => {
    mockSend.mockResolvedValue({ Attributes: buildItem() });

    await run(repository);

    const command = mockSend.mock.calls[0]?.[0] as UpdateCommand;
    expect(command).toBeInstanceOf(UpdateCommand);
    expect(command.input.Key).toEqual({ PK: 'JOB#job-1', SK: 'JOB#job-1' });
    const parsed = parseUpdateExpression(command.input);
    expect(parsed.set).toEqual({ ...set, UpdatedAt: NOW });
    expect(parsed.remove).toEqual(remove);
  });

  it('更新対象のジョブがなければ EntityNotFoundError を投げる', async () => {
    mockSend.mockRejectedValue(conditionalCheckFailed());

    await expect(repository.updateBatchStage('missing', 'clipping')).rejects.toBeInstanceOf(
      EntityNotFoundError
    );
  });
});
