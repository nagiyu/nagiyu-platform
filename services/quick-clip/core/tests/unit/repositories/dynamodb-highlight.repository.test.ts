import {
  GetCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DynamoDBHighlightRepository } from '../../../src/repositories/dynamodb-highlight.repository.js';

describe('DynamoDBHighlightRepository', () => {
  const TABLE_NAME = 'test-table';
  let mockSend: jest.Mock;
  let mockDocClient: DynamoDBDocumentClient;
  let repository: DynamoDBHighlightRepository;

  beforeEach(() => {
    mockSend = jest.fn();
    mockDocClient = {
      send: mockSend,
    } as unknown as DynamoDBDocumentClient;
    repository = new DynamoDBHighlightRepository(mockDocClient, TABLE_NAME);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('createMany は clipStatus と source を保存する', async () => {
    mockSend.mockResolvedValue({});

    await repository.createMany([
      {
        highlightId: 'h1',
        jobId: 'job-1',
        order: 1,
        startSec: 10,
        endSec: 20,
        source: 'motion',
        status: 'unconfirmed',
        clipStatus: 'PENDING',
        expiresAt: 1234567890,
      },
    ]);

    const sentCommand = mockSend.mock.calls[0]?.[0] as UpdateCommand;
    expect(sentCommand).toBeInstanceOf(UpdateCommand);
    expect(sentCommand.input.ExpressionAttributeNames).toMatchObject({
      '#clipStatus': 'clipStatus',
      '#source': 'source',
    });
    expect(sentCommand.input.ExpressionAttributeValues).toMatchObject({
      ':clipStatus': 'PENDING',
      ':source': 'motion',
    });
  });

  it('createMany は expiresAt を保存する', async () => {
    mockSend.mockResolvedValue({});

    await repository.createMany([
      {
        highlightId: 'h1',
        jobId: 'job-1',
        order: 1,
        startSec: 10,
        endSec: 20,
        source: 'motion',
        status: 'unconfirmed',
        clipStatus: 'PENDING',
        expiresAt: 1234567890,
      },
    ]);

    const sentCommand = mockSend.mock.calls[0]?.[0] as UpdateCommand;
    expect(sentCommand).toBeInstanceOf(UpdateCommand);
    expect(sentCommand.input.ExpressionAttributeNames).toMatchObject({
      '#expiresAt': 'expiresAt',
    });
    expect(sentCommand.input.ExpressionAttributeValues).toMatchObject({
      ':expiresAt': 1234567890,
    });
    expect(sentCommand.input.UpdateExpression).toContain('#expiresAt = :expiresAt');
  });

  it('createMany は dominantEmotion が指定された場合に保存する', async () => {
    mockSend.mockResolvedValue({});

    await repository.createMany([
      {
        highlightId: 'h1',
        jobId: 'job-1',
        order: 1,
        startSec: 10,
        endSec: 20,
        source: 'emotion',
        status: 'unconfirmed',
        clipStatus: 'PENDING',
        dominantEmotion: 'laugh',
        expiresAt: 1234567890,
      },
    ]);

    const sentCommand = mockSend.mock.calls[0]?.[0] as UpdateCommand;
    expect(sentCommand).toBeInstanceOf(UpdateCommand);
    expect(sentCommand.input.ExpressionAttributeNames).toMatchObject({
      '#dominantEmotion': 'dominantEmotion',
    });
    expect(sentCommand.input.ExpressionAttributeValues).toMatchObject({
      ':dominantEmotion': 'laugh',
    });
    expect(sentCommand.input.UpdateExpression).toContain('#dominantEmotion = :dominantEmotion');
  });

  it('createMany は dominantEmotion が未指定の場合に保存しない', async () => {
    mockSend.mockResolvedValue({});

    await repository.createMany([
      {
        highlightId: 'h1',
        jobId: 'job-1',
        order: 1,
        startSec: 10,
        endSec: 20,
        source: 'motion',
        status: 'unconfirmed',
        clipStatus: 'PENDING',
        expiresAt: 1234567890,
      },
    ]);

    const sentCommand = mockSend.mock.calls[0]?.[0] as UpdateCommand;
    expect(sentCommand).toBeInstanceOf(UpdateCommand);
    expect(sentCommand.input.ExpressionAttributeNames).not.toHaveProperty('#dominantEmotion');
    expect(sentCommand.input.ExpressionAttributeValues).not.toHaveProperty(':dominantEmotion');
    expect(sentCommand.input.UpdateExpression).not.toContain('dominantEmotion');
  });

  it('getByJobId は clipStatus と source を含めて返す', async () => {
    mockSend.mockResolvedValue({
      Items: [
        {
          PK: 'JOB#job-1',
          SK: 'HIGHLIGHT#h1',
          Type: 'HIGHLIGHT',
          highlightId: 'h1',
          jobId: 'job-1',
          order: 1,
          startSec: 10,
          endSec: 20,
          source: 'both',
          status: 'unconfirmed',
          clipStatus: 'GENERATED',
          expiresAt: 1234567890,
        },
      ],
    });

    const result = await repository.getByJobId('job-1');

    const sentCommand = mockSend.mock.calls[0]?.[0] as QueryCommand;
    expect(sentCommand).toBeInstanceOf(QueryCommand);
    expect(result).toEqual([
      {
        highlightId: 'h1',
        jobId: 'job-1',
        order: 1,
        startSec: 10,
        endSec: 20,
        source: 'both',
        status: 'unconfirmed',
        clipStatus: 'GENERATED',
        dominantEmotion: undefined,
        expiresAt: 1234567890,
      },
    ]);
  });

  it('getByJobId は dominantEmotion を含めて返す', async () => {
    mockSend.mockResolvedValue({
      Items: [
        {
          PK: 'JOB#job-1',
          SK: 'HIGHLIGHT#h1',
          Type: 'HIGHLIGHT',
          highlightId: 'h1',
          jobId: 'job-1',
          order: 1,
          startSec: 10,
          endSec: 20,
          source: 'emotion',
          status: 'unconfirmed',
          clipStatus: 'PENDING',
          dominantEmotion: 'excite',
          expiresAt: 1234567890,
        },
      ],
    });

    const result = await repository.getByJobId('job-1');

    expect(result[0]?.dominantEmotion).toBe('excite');
  });

  it('getById は clipStatus と source を含めて返す', async () => {
    mockSend.mockResolvedValue({
      Item: {
        PK: 'JOB#job-1',
        SK: 'HIGHLIGHT#h1',
        Type: 'HIGHLIGHT',
        highlightId: 'h1',
        jobId: 'job-1',
        order: 1,
        startSec: 10,
        endSec: 20,
        source: 'volume',
        status: 'unconfirmed',
        clipStatus: 'FAILED',
        expiresAt: 1234567890,
      },
    });

    const result = await repository.getById('job-1', 'h1');

    const sentCommand = mockSend.mock.calls[0]?.[0] as GetCommand;
    expect(sentCommand).toBeInstanceOf(GetCommand);
    expect(result).toEqual({
      highlightId: 'h1',
      jobId: 'job-1',
      order: 1,
      startSec: 10,
      endSec: 20,
      source: 'volume',
      status: 'unconfirmed',
      clipStatus: 'FAILED',
      dominantEmotion: undefined,
      expiresAt: 1234567890,
    });
  });

  it('update は clipStatus を更新できる', async () => {
    mockSend.mockResolvedValueOnce({}).mockResolvedValueOnce({
      Item: {
        PK: 'JOB#job-1',
        SK: 'HIGHLIGHT#h1',
        Type: 'HIGHLIGHT',
        highlightId: 'h1',
        jobId: 'job-1',
        order: 1,
        startSec: 10,
        endSec: 20,
        source: 'motion',
        status: 'unconfirmed',
        clipStatus: 'GENERATED',
        expiresAt: 1234567890,
      },
    });

    const result = await repository.update('job-1', 'h1', { clipStatus: 'GENERATED' });

    const updateCommand = mockSend.mock.calls[0]?.[0] as UpdateCommand;
    expect(updateCommand).toBeInstanceOf(UpdateCommand);
    expect(updateCommand.input.ExpressionAttributeNames).toMatchObject({
      '#clipStatus': 'clipStatus',
    });
    expect(updateCommand.input.ExpressionAttributeValues).toMatchObject({
      ':clipStatus': 'GENERATED',
    });
    expect(result.clipStatus).toBe('GENERATED');
  });
});
