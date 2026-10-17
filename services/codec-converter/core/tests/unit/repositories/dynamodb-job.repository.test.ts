import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { EntityAlreadyExistsError, EntityNotFoundError } from '@nagiyu/aws';
import { DynamoDBJobRepository } from '../../../src/repositories/dynamodb-job.repository';
import { parseUpdateExpression } from '../../helpers/update-expression';
import type { Job } from '../../../src/types';

const NOW = 1704067300000;
const CREATED_AT = 1704067200000;
const EXPIRES_AT = 1704153600000;
const TABLE_NAME = 'test-codec-converter-table';

function buildJob(overrides: Partial<Job> = {}): Job {
  return {
    jobId: 'job-123',
    status: 'PENDING',
    inputFile: 'uploads/job-123/input.mp4',
    outputCodec: 'h264',
    fileName: 'sample.mp4',
    fileSize: 1024,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    jobId: 'job-123',
    Type: 'Job',
    Status: 'PENDING',
    InputFile: 'uploads/job-123/input.mp4',
    OutputCodec: 'h264',
    FileName: 'sample.mp4',
    FileSize: 1024,
    CreatedAt: CREATED_AT,
    UpdatedAt: CREATED_AT,
    TTL: 1704153600,
    ...overrides,
  };
}

function conditionalCheckFailed(): Error {
  const error = new Error('Conditional check failed');
  error.name = 'ConditionalCheckFailedException';
  return error;
}

describe('DynamoDBJobRepository', () => {
  let repository: DynamoDBJobRepository;
  let send: jest.Mock;

  beforeEach(() => {
    // UpdatedAt は EntityStore が現在時刻で書くため、時刻を固定して検証する
    jest.useFakeTimers().setSystemTime(NOW);
    send = jest.fn();
    repository = new DynamoDBJobRepository(
      { send } as unknown as DynamoDBDocumentClient,
      TABLE_NAME
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getById', () => {
    it('jobId をキーに取得し、Entity に変換する', async () => {
      send.mockResolvedValueOnce({ Item: buildItem() });

      const result = await repository.getById('job-123');

      expect(result).toEqual(buildJob());
      const command = send.mock.calls[0][0] as GetCommand;
      expect(command).toBeInstanceOf(GetCommand);
      expect(command.input).toMatchObject({ TableName: TABLE_NAME, Key: { jobId: 'job-123' } });
    });

    it('旧形式のアイテムも読める', async () => {
      send.mockResolvedValueOnce({
        Item: {
          jobId: 'job-123',
          status: 'PROCESSING',
          inputFile: 'uploads/job-123/input.mp4',
          outputCodec: 'vp9',
          fileName: 'sample.mp4',
          fileSize: 1024,
          createdAt: 1704067200,
          updatedAt: 1704067200,
          expiresAt: 1704153600,
        },
      });

      const result = await repository.getById('job-123');

      expect(result).toEqual(
        buildJob({ status: 'PROCESSING', outputCodec: 'vp9', createdAt: CREATED_AT })
      );
    });

    it('なければ null を返す', async () => {
      send.mockResolvedValueOnce({});

      expect(await repository.getById('missing')).toBeNull();
    });
  });

  describe('create', () => {
    it('保存形式の Item として条件付きで書き込み、Entity を返す', async () => {
      send.mockResolvedValueOnce({ $metadata: {} });

      const result = await repository.create(buildJob({ updatedAt: 0 }));

      expect(result).toEqual(buildJob({ updatedAt: NOW }));
      const command = send.mock.calls[0][0] as PutCommand;
      expect(command).toBeInstanceOf(PutCommand);
      expect(command.input.TableName).toBe(TABLE_NAME);
      expect(command.input.Item).toEqual(buildItem({ UpdatedAt: NOW }));
      expect(command.input.ConditionExpression).toBeDefined();
    });

    it('既にあれば EntityAlreadyExistsError にする', async () => {
      send.mockRejectedValueOnce(conditionalCheckFailed());

      await expect(repository.create(buildJob())).rejects.toThrow(EntityAlreadyExistsError);
    });
  });

  describe('updateStatus', () => {
    it('ステータスを更新し、旧属性名を削除して更新後の Entity を返す', async () => {
      send.mockResolvedValueOnce({
        Attributes: buildItem({
          Status: 'COMPLETED',
          OutputFile: 'outputs/job-123/output.mp4',
          UpdatedAt: NOW,
        }),
      });

      const result = await repository.updateStatus('job-123', {
        status: 'COMPLETED',
        outputFile: 'outputs/job-123/output.mp4',
      });

      expect(result).toEqual(
        buildJob({ status: 'COMPLETED', outputFile: 'outputs/job-123/output.mp4', updatedAt: NOW })
      );
      const command = send.mock.calls[0][0] as UpdateCommand;
      expect(command).toBeInstanceOf(UpdateCommand);
      expect(command.input.Key).toEqual({ jobId: 'job-123' });
      expect(parseUpdateExpression(command.input)).toEqual({
        set: {
          Status: 'COMPLETED',
          OutputFile: 'outputs/job-123/output.mp4',
          UpdatedAt: NOW,
        },
        remove: expect.arrayContaining(['status', 'outputFile', 'updatedAt']),
      });
    });

    it('未指定の項目は変更しない', async () => {
      send.mockResolvedValueOnce({ Attributes: buildItem({ Status: 'PROCESSING' }) });

      await repository.updateStatus('job-123', { status: 'PROCESSING' });

      const command = send.mock.calls[0][0] as UpdateCommand;
      const parsed = parseUpdateExpression(command.input);
      expect(Object.keys(parsed.set).sort()).toEqual(['Status', 'UpdatedAt']);
      expect(parsed.remove).not.toContain('outputFile');
      expect(parsed.remove).not.toContain('errorMessage');
    });

    it('errorMessage を保存する', async () => {
      send.mockResolvedValueOnce({
        Attributes: buildItem({ Status: 'FAILED', ErrorMessage: '失敗' }),
      });

      const result = await repository.updateStatus('job-123', {
        status: 'FAILED',
        errorMessage: '失敗',
      });

      expect(result.errorMessage).toBe('失敗');
      const command = send.mock.calls[0][0] as UpdateCommand;
      expect(parseUpdateExpression(command.input).set).toMatchObject({ ErrorMessage: '失敗' });
    });

    it('対象がなければ EntityNotFoundError にする', async () => {
      send.mockRejectedValueOnce(conditionalCheckFailed());

      await expect(repository.updateStatus('missing', { status: 'PROCESSING' })).rejects.toThrow(
        EntityNotFoundError
      );
    });
  });
});
