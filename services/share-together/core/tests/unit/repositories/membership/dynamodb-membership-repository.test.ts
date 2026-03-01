import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DynamoDBMembershipRepository } from '../../../../src/repositories/membership/dynamodb-membership-repository.js';

describe('DynamoDBMembershipRepository', () => {
  const TABLE_NAME = 'test-share-together-main';
  let repository: DynamoDBMembershipRepository;
  let mockDocClient: { send: jest.Mock };

  beforeEach(() => {
    mockDocClient = {
      send: jest.fn(),
    };

    repository = new DynamoDBMembershipRepository(
      mockDocClient as unknown as DynamoDBDocumentClient,
      TABLE_NAME
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createMembershipItem = (
    overrides: Record<string, unknown> = {}
  ): Record<string, unknown> => ({
    PK: 'GROUP#group-1',
    SK: 'MEMBER#user-1',
    GSI1PK: 'USER#user-1',
    GSI1SK: 'GROUP#group-1',
    groupId: 'group-1',
    userId: 'user-1',
    role: 'MEMBER',
    status: 'PENDING',
    invitedBy: 'owner-1',
    invitedAt: '2026-01-01T00:00:00.000Z',
    TTL: 1_700_000_000,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });

  it('getById はメンバーシップを取得できる', async () => {
    mockDocClient.send.mockResolvedValueOnce({
      Item: createMembershipItem(),
    });

    const result = await repository.getById('group-1', 'user-1');
    const command = mockDocClient.send.mock.calls[0]?.[0] as GetCommand;

    expect(result).toEqual({
      groupId: 'group-1',
      userId: 'user-1',
      role: 'MEMBER',
      status: 'PENDING',
      invitedBy: 'owner-1',
      invitedAt: '2026-01-01T00:00:00.000Z',
      respondedAt: undefined,
      ttl: 1_700_000_000,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(command.input).toEqual({
      TableName: TABLE_NAME,
      Key: {
        PK: 'GROUP#group-1',
        SK: 'MEMBER#user-1',
      },
    });
  });

  it('getByUserId は GSI1 を使って所属グループを取得する', async () => {
    mockDocClient.send.mockResolvedValueOnce({
      Items: [createMembershipItem()],
    });

    const result = await repository.getByUserId('user-1');
    const command = mockDocClient.send.mock.calls[0]?.[0] as QueryCommand;

    expect(result).toHaveLength(1);
    expect(command.input).toEqual({
      TableName: TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: '#gsi1pk = :gsi1pk',
      ExpressionAttributeNames: {
        '#gsi1pk': 'GSI1PK',
      },
      ExpressionAttributeValues: {
        ':gsi1pk': 'USER#user-1',
      },
    });
  });

  it('getPendingInvitationsByUserId は PENDING フィルタを含む GSI1 クエリを実行する', async () => {
    mockDocClient.send.mockResolvedValueOnce({
      Items: [createMembershipItem()],
    });

    await repository.getPendingInvitationsByUserId('user-1');
    const command = mockDocClient.send.mock.calls[0]?.[0] as QueryCommand;

    expect(command.input).toEqual({
      TableName: TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: '#gsi1pk = :gsi1pk',
      FilterExpression: '#status = :pending',
      ExpressionAttributeNames: {
        '#gsi1pk': 'GSI1PK',
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':gsi1pk': 'USER#user-1',
        ':pending': 'PENDING',
      },
    });
  });

  it('create は TTL を含むレコードを保存する', async () => {
    mockDocClient.send.mockResolvedValueOnce({});

    const result = await repository.create({
      groupId: 'group-1',
      userId: 'user-1',
      role: 'MEMBER',
      status: 'PENDING',
      invitedBy: 'owner-1',
      invitedAt: '2026-01-01T00:00:00.000Z',
      ttl: 1_700_000_000,
    });
    const command = mockDocClient.send.mock.calls[0]?.[0] as PutCommand;
    const item = command.input.Item as Record<string, unknown>;

    expect(result.ttl).toBe(1_700_000_000);
    expect(item['GSI1PK']).toBe('USER#user-1');
    expect(item['TTL']).toBe(1_700_000_000);
  });

  it('update は ttl: undefined 指定時に TTL を REMOVE する', async () => {
    mockDocClient.send.mockResolvedValueOnce({
      Attributes: createMembershipItem({
        status: 'ACCEPTED',
        TTL: undefined,
        respondedAt: '2026-01-02T00:00:00.000Z',
      }),
    });

    const result = await repository.update('group-1', 'user-1', {
      status: 'ACCEPTED',
      respondedAt: '2026-01-02T00:00:00.000Z',
      ttl: undefined,
    });
    const command = mockDocClient.send.mock.calls[0]?.[0] as UpdateCommand;

    expect(result.status).toBe('ACCEPTED');
    expect(result.ttl).toBeUndefined();
    expect(command.input.UpdateExpression).toContain('REMOVE #ttl');
  });
});
