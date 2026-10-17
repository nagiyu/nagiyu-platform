/**
 * 単一アイテムの CRUD の振る舞い (エラー変換など) は EntityStore の責務のため、
 * ここでは正しいキーと保存形式で委譲していることと、ジョブ単位の Query を検証する。
 */
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DatabaseError, EntityNotFoundError, InvalidEntityDataError } from '@nagiyu/aws';
import { DynamoDBHighlightRepository } from '../../../src/repositories/dynamodb-highlight.repository.js';
import type { Highlight } from '../../../src/types.js';
import { parseUpdateExpression } from '../../helpers/update-expression.js';

const NOW = 1704067300000;
const EXPIRES_AT = 1704153600000;

function buildHighlight(overrides: Partial<Highlight> = {}): Highlight {
  return {
    highlightId: 'h-1',
    jobId: 'job-1',
    order: 1,
    startSec: 10,
    endSec: 20,
    source: 'motion',
    status: 'unconfirmed',
    clipStatus: 'PENDING',
    expiresAt: EXPIRES_AT,
    ...overrides,
  };
}

function buildItem(overrides: Record<string, unknown> = {}) {
  return {
    PK: 'JOB#job-1',
    SK: 'HIGHLIGHT#h-1',
    Type: 'HIGHLIGHT',
    HighlightID: 'h-1',
    JobID: 'job-1',
    Order: 1,
    StartSec: 10,
    EndSec: 20,
    Source: 'motion',
    Status: 'unconfirmed',
    ClipStatus: 'PENDING',
    TTL: EXPIRES_AT / 1000,
    UpdatedAt: NOW,
    ...overrides,
  };
}

function conditionalCheckFailed(): Error {
  const error = new Error('Conditional check failed');
  error.name = 'ConditionalCheckFailedException';
  return error;
}

describe('DynamoDBHighlightRepository', () => {
  const TABLE_NAME = 'test-table';
  let mockSend: jest.Mock;
  let repository: DynamoDBHighlightRepository;

  beforeEach(() => {
    // UpdatedAt は EntityStore が現在時刻で書くため、時刻を固定して検証する
    jest.useFakeTimers().setSystemTime(NOW);
    mockSend = jest.fn();
    repository = new DynamoDBHighlightRepository(
      { send: mockSend } as unknown as DynamoDBDocumentClient,
      TABLE_NAME
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('createMany', () => {
    it('各見どころを upsert (Put) で保存形式の Item として書き込む', async () => {
      mockSend.mockResolvedValue({});

      await repository.createMany([
        buildHighlight({ dominantEmotion: 'laugh', source: 'emotion' }),
        buildHighlight({ highlightId: 'h-2', order: 2 }),
      ]);

      expect(mockSend).toHaveBeenCalledTimes(2);
      const first = mockSend.mock.calls[0]?.[0] as PutCommand;
      expect(first).toBeInstanceOf(PutCommand);
      expect(first.input.ConditionExpression).toBeUndefined();
      expect(first.input.Item).toEqual({
        PK: 'JOB#job-1',
        SK: 'HIGHLIGHT#h-1',
        Type: 'HIGHLIGHT',
        HighlightID: 'h-1',
        JobID: 'job-1',
        Order: 1,
        StartSec: 10,
        EndSec: 20,
        Source: 'emotion',
        Status: 'unconfirmed',
        ClipStatus: 'PENDING',
        DominantEmotion: 'laugh',
        TTL: EXPIRES_AT / 1000,
        UpdatedAt: NOW,
      });
      const second = mockSend.mock.calls[1]?.[0] as PutCommand;
      expect(second.input.Item).toMatchObject({ SK: 'HIGHLIGHT#h-2', Order: 2 });
      expect(second.input.Item).not.toHaveProperty('DominantEmotion');
    });
  });

  describe('getById', () => {
    it('存在する見どころを Entity として返す', async () => {
      mockSend.mockResolvedValue({ Item: buildItem() });

      const result = await repository.getById('job-1', 'h-1');

      const command = mockSend.mock.calls[0]?.[0] as GetCommand;
      expect(command).toBeInstanceOf(GetCommand);
      expect(command.input.Key).toEqual({ PK: 'JOB#job-1', SK: 'HIGHLIGHT#h-1' });
      expect(result).toEqual(buildHighlight());
    });

    it('旧形式 (camelCase・expiresAt) の見どころも読める', async () => {
      mockSend.mockResolvedValue({
        Item: {
          PK: 'JOB#job-1',
          SK: 'HIGHLIGHT#h-1',
          Type: 'HIGHLIGHT',
          highlightId: 'h-1',
          jobId: 'job-1',
          order: 1,
          startSec: 10,
          endSec: 20,
          source: 'motion',
          status: 'unconfirmed',
          clipStatus: 'PENDING',
          expiresAt: EXPIRES_AT / 1000,
        },
      });

      expect(await repository.getById('job-1', 'h-1')).toEqual(buildHighlight());
    });

    it('存在しなければ null を返す', async () => {
      mockSend.mockResolvedValue({});

      expect(await repository.getById('job-1', 'missing')).toBeNull();
    });

    it('読めないデータは InvalidEntityDataError を投げる', async () => {
      mockSend.mockResolvedValue({ Item: buildItem({ Source: 'unknown' }) });

      await expect(repository.getById('job-1', 'h-1')).rejects.toBeInstanceOf(
        InvalidEntityDataError
      );
    });
  });

  describe('getByJobId', () => {
    it('PK 一致と SK の HIGHLIGHT# 前方一致で Query し、order 順に返す', async () => {
      mockSend.mockResolvedValue({
        Items: [
          buildItem({ HighlightID: 'h-2', SK: 'HIGHLIGHT#h-2', Order: 2 }),
          buildItem({ HighlightID: 'h-1', SK: 'HIGHLIGHT#h-1', Order: 1 }),
        ],
      });

      const result = await repository.getByJobId('job-1');

      const command = mockSend.mock.calls[0]?.[0] as QueryCommand;
      expect(command).toBeInstanceOf(QueryCommand);
      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :highlightPrefix)',
        ExpressionAttributeValues: { ':pk': 'JOB#job-1', ':highlightPrefix': 'HIGHLIGHT#' },
      });
      expect(result.map((h) => h.highlightId)).toEqual(['h-1', 'h-2']);
    });

    it('LastEvaluatedKey が返る限り全ページを辿る', async () => {
      mockSend
        .mockResolvedValueOnce({
          Items: [buildItem({ HighlightID: 'h-2', SK: 'HIGHLIGHT#h-2', Order: 2 })],
          LastEvaluatedKey: { PK: 'JOB#job-1', SK: 'HIGHLIGHT#h-2' },
        })
        .mockResolvedValueOnce({ Items: [buildItem()] });

      const result = await repository.getByJobId('job-1');

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(result.map((h) => h.highlightId)).toEqual(['h-1', 'h-2']);
    });

    it('見どころがなければ空配列を返す', async () => {
      mockSend.mockResolvedValue({});

      expect(await repository.getByJobId('job-1')).toEqual([]);
    });

    it('Query の失敗は DatabaseError にする', async () => {
      mockSend.mockRejectedValue(new Error('boom'));

      await expect(repository.getByJobId('job-1')).rejects.toBeInstanceOf(DatabaseError);
    });
  });

  describe('update', () => {
    it('新属性名で SET し、旧属性名を REMOVE して、更新後の Entity を返す', async () => {
      mockSend.mockResolvedValue({
        Attributes: buildItem({ StartSec: 15, Status: 'accepted' }),
      });

      const result = await repository.update('job-1', 'h-1', { startSec: 15, status: 'accepted' });

      const command = mockSend.mock.calls[0]?.[0] as UpdateCommand;
      expect(command).toBeInstanceOf(UpdateCommand);
      expect(command.input.Key).toEqual({ PK: 'JOB#job-1', SK: 'HIGHLIGHT#h-1' });
      const parsed = parseUpdateExpression(command.input);
      expect(parsed.set).toEqual({ StartSec: 15, Status: 'accepted', UpdatedAt: NOW });
      expect([...parsed.remove].sort()).toEqual(['startSec', 'status']);
      expect(result).toEqual(buildHighlight({ startSec: 15, status: 'accepted' }));
    });

    it('対象がなければ EntityNotFoundError を投げる', async () => {
      mockSend.mockRejectedValue(conditionalCheckFailed());

      await expect(
        repository.update('job-1', 'missing', { clipStatus: 'GENERATED' })
      ).rejects.toBeInstanceOf(EntityNotFoundError);
    });
  });
});
