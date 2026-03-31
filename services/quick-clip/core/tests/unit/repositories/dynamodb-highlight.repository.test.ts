import { QueryCommand, UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
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

  it('createMany は clipStatus を保存する', async () => {
    mockSend.mockResolvedValue({});

    await repository.createMany([
      {
        highlightId: 'h1',
        jobId: 'job-1',
        order: 1,
        startSec: 10,
        endSec: 20,
        status: 'pending',
        clipStatus: 'PENDING',
      },
    ]);

    const sentCommand = mockSend.mock.calls[0]?.[0] as UpdateCommand;
    expect(sentCommand).toBeInstanceOf(UpdateCommand);
    expect(sentCommand.input.ExpressionAttributeNames).toMatchObject({
      '#clipStatus': 'clipStatus',
    });
    expect(sentCommand.input.ExpressionAttributeValues).toMatchObject({
      ':clipStatus': 'PENDING',
    });
  });

  it('getByJobId は clipStatus を含めて返す', async () => {
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
          status: 'pending',
          clipStatus: 'GENERATED',
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
        status: 'pending',
        clipStatus: 'GENERATED',
      },
    ]);
  });
});
