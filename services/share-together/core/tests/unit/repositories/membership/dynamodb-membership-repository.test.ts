import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DynamoDBMembershipRepository } from '../../../../src/repositories/membership/dynamodb-membership-repository.js';
import { parseUpdateExpression } from '../../../helpers/update-expression.js';

import { DatabaseError } from '@nagiyu/aws';

const createSdkError = (): Error =>
  Object.assign(new Error('スループット超過'), { name: 'ProvisionedThroughputExceededException' });

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

  it('getById は対象が存在しない場合に null を返す', async () => {
    mockDocClient.send.mockResolvedValueOnce({});

    const result = await repository.getById('group-1', 'user-404');
    const command = mockDocClient.send.mock.calls[0]?.[0] as GetCommand;

    expect(result).toBeNull();
    expect(command.input).toEqual({
      TableName: TABLE_NAME,
      Key: {
        PK: 'GROUP#group-1',
        SK: 'MEMBER#user-404',
      },
    });
  });

  it('getByGroupId はメンバー一覧を取得する', async () => {
    mockDocClient.send.mockResolvedValueOnce({
      Items: [
        createMembershipItem(),
        createMembershipItem({ userId: 'user-2', SK: 'MEMBER#user-2' }),
      ],
    });

    const result = await repository.getByGroupId('group-1');
    const command = mockDocClient.send.mock.calls[0]?.[0] as QueryCommand;

    expect(result).toHaveLength(2);
    expect(command.input).toEqual({
      TableName: TABLE_NAME,
      KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :memberSkPrefix)',
      ExpressionAttributeNames: {
        '#pk': 'PK',
        '#sk': 'SK',
      },
      ExpressionAttributeValues: {
        ':pk': 'GROUP#group-1',
        ':memberSkPrefix': 'MEMBER#',
      },
    });
  });

  it('getByGroupId は対象がない場合に空配列を返す', async () => {
    mockDocClient.send.mockResolvedValueOnce({});

    await expect(repository.getByGroupId('group-1')).resolves.toEqual([]);
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

  it('getByUserId は対象がない場合に空配列を返す', async () => {
    mockDocClient.send.mockResolvedValueOnce({});

    await expect(repository.getByUserId('user-404')).resolves.toEqual([]);
  });

  it('getByGroupId は不正データを含む場合にエラーを投げる', async () => {
    mockDocClient.send.mockResolvedValueOnce({
      Items: [createMembershipItem({ status: 'INVALID_STATUS' })],
    });

    await expect(repository.getByGroupId('group-1')).rejects.toThrow(
      'メンバーシップ情報の形式が不正です'
    );
  });

  it('getByUserId は不正データを含む場合にエラーを投げる', async () => {
    mockDocClient.send.mockResolvedValueOnce({
      Items: [createMembershipItem({ role: 'INVALID_ROLE' })],
    });

    await expect(repository.getByUserId('user-1')).rejects.toThrow(
      'メンバーシップ情報の形式が不正です'
    );
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
    const parsed = parseUpdateExpression(command.input);
    expect(parsed.remove).toEqual(['TTL']);
    expect(parsed.set).toMatchObject({
      status: 'ACCEPTED',
      respondedAt: '2026-01-02T00:00:00.000Z',
    });
  });

  it('update は ttl を指定しない場合に TTL を式にもプレースホルダにも含めない', async () => {
    mockDocClient.send.mockResolvedValueOnce({
      Attributes: createMembershipItem({ status: 'ACCEPTED' }),
    });

    await repository.update('group-1', 'user-1', { status: 'ACCEPTED' });
    const command = mockDocClient.send.mock.calls[0]?.[0] as UpdateCommand;

    const parsed = parseUpdateExpression(command.input);
    expect(parsed.set).toMatchObject({ status: 'ACCEPTED', updatedAt: expect.any(String) });
    expect(parsed.set).not.toHaveProperty('TTL');
    expect(parsed.remove).toEqual([]);
    expect(Object.values(command.input.ExpressionAttributeNames ?? {})).not.toContain('TTL');
  });

  it('update は対象フィールドがなくても updatedAt のみ更新する', async () => {
    mockDocClient.send.mockResolvedValueOnce({ Attributes: createMembershipItem({}) });

    await repository.update('group-1', 'user-1', {});
    const command = mockDocClient.send.mock.calls[0]?.[0] as UpdateCommand;

    const parsed = parseUpdateExpression(command.input);
    expect(Object.keys(parsed.set)).toEqual(['updatedAt']);
    expect(parsed.remove).toEqual([]);
  });

  it('update は optional 項目を個別に SET/REMOVE できる', async () => {
    mockDocClient.send.mockResolvedValueOnce({
      Attributes: createMembershipItem({
        status: 'ACCEPTED',
        role: 'OWNER',
        invitedBy: undefined,
        invitedAt: undefined,
        respondedAt: undefined,
        TTL: 1_800_000_000,
      }),
    });

    await repository.update('group-1', 'user-1', {
      role: 'OWNER',
      status: 'ACCEPTED',
      invitedBy: undefined,
      invitedAt: undefined,
      respondedAt: undefined,
      ttl: 1_800_000_000,
    });
    const command = mockDocClient.send.mock.calls[0]?.[0] as UpdateCommand;

    const parsed = parseUpdateExpression(command.input);
    expect(parsed.set).toMatchObject({
      role: 'OWNER',
      status: 'ACCEPTED',
      TTL: 1_800_000_000,
      updatedAt: expect.any(String),
    });
    expect([...parsed.remove].sort()).toEqual(['invitedAt', 'invitedBy', 'respondedAt']);
  });

  it('update は更新対象がない場合にエラーを投げる', async () => {
    mockDocClient.send.mockResolvedValueOnce({});

    await expect(repository.update('group-1', 'user-1', {})).rejects.toThrow(
      'メンバーシップが見つかりません'
    );
  });

  it('不正な role を含むメンバーシップ取得時にエラーを投げる', async () => {
    mockDocClient.send.mockResolvedValueOnce({
      Item: createMembershipItem({ role: 'INVALID_ROLE' }),
    });
    await expect(repository.getById('group-1', 'user-1')).rejects.toThrow(
      'メンバーシップ情報の形式が不正です'
    );
  });

  it('不正な status を含むメンバーシップ取得時にエラーを投げる', async () => {
    mockDocClient.send.mockResolvedValueOnce({
      Item: createMembershipItem({ status: 'INVALID_STATUS' }),
    });
    await expect(repository.getById('group-1', 'user-1')).rejects.toThrow(
      'メンバーシップ情報の形式が不正です'
    );
  });

  it('不正な optional 項目型を含むメンバーシップ取得時にエラーを投げる', async () => {
    mockDocClient.send.mockResolvedValueOnce({
      Item: createMembershipItem({ invitedBy: 123 }),
    });
    await expect(repository.getById('group-1', 'user-1')).rejects.toThrow(
      'メンバーシップ情報の形式が不正です'
    );
  });

  it('delete は該当メンバーシップを削除する', async () => {
    mockDocClient.send.mockResolvedValueOnce({});

    await repository.delete('group-1', 'user-1');
    const command = mockDocClient.send.mock.calls[0]?.[0] as DeleteCommand;

    expect(command.input).toEqual({
      TableName: TABLE_NAME,
      Key: {
        PK: 'GROUP#group-1',
        SK: 'MEMBER#user-1',
      },
    });
  });

  it('deleteByGroupId は取得したメンバーを順に削除する', async () => {
    mockDocClient.send
      .mockResolvedValueOnce({
        Items: [
          createMembershipItem(),
          createMembershipItem({ userId: 'user-2', SK: 'MEMBER#user-2' }),
        ],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    await repository.deleteByGroupId('group-1');

    const firstCommand = mockDocClient.send.mock.calls[1]?.[0] as DeleteCommand;
    const secondCommand = mockDocClient.send.mock.calls[2]?.[0] as DeleteCommand;
    expect(firstCommand.input.Key).toEqual({
      PK: 'GROUP#group-1',
      SK: 'MEMBER#user-1',
    });
    expect(secondCommand.input.Key).toEqual({
      PK: 'GROUP#group-1',
      SK: 'MEMBER#user-2',
    });
  });

  describe('ページング', () => {
    const lastEvaluatedKey = { PK: 'GROUP#group-1', SK: 'MEMBER#user-1' };

    const expectPaged = async (
      run: () => Promise<{ userId: string }[]>,
      firstItem: Record<string, unknown>,
      secondItem: Record<string, unknown>
    ): Promise<void> => {
      mockDocClient.send
        .mockResolvedValueOnce({ Items: [firstItem], LastEvaluatedKey: lastEvaluatedKey })
        .mockResolvedValueOnce({ Items: [secondItem] });

      const result = await run();

      expect(result.map((membership) => membership.userId)).toEqual(['user-1', 'user-2']);
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);
      const secondCommand = mockDocClient.send.mock.calls[1]?.[0] as QueryCommand;
      expect(secondCommand.input.ExclusiveStartKey).toEqual(lastEvaluatedKey);
    };

    it('getByGroupId は複数ページにわたる全件を取得する', async () => {
      await expectPaged(
        () => repository.getByGroupId('group-1'),
        createMembershipItem(),
        createMembershipItem({ SK: 'MEMBER#user-2', userId: 'user-2' })
      );
    });

    it('getByUserId は複数ページにわたる全件を取得する', async () => {
      await expectPaged(
        () => repository.getByUserId('user-1'),
        createMembershipItem(),
        createMembershipItem({ userId: 'user-2' })
      );
    });

    it('getPendingInvitationsByUserId は複数ページにわたる全件を取得する', async () => {
      await expectPaged(
        () => repository.getPendingInvitationsByUserId('user-1'),
        createMembershipItem(),
        createMembershipItem({ userId: 'user-2' })
      );
    });
  });

  describe('SDK例外のDatabaseError化', () => {
    it('取得時のSDK例外はDatabaseErrorに包まれる', async () => {
      mockDocClient.send.mockRejectedValueOnce(createSdkError());

      const promise = repository.getById('group-1', 'user-1');

      await expect(promise).rejects.toBeInstanceOf(DatabaseError);
      await expect(promise).rejects.toMatchObject({
        cause: expect.objectContaining({ name: 'ProvisionedThroughputExceededException' }),
      });
    });

    it('更新時のSDK例外はDatabaseErrorに包まれる', async () => {
      mockDocClient.send.mockRejectedValueOnce(createSdkError());

      const promise = repository.update('group-1', 'user-1', { role: 'OWNER' });

      await expect(promise).rejects.toBeInstanceOf(DatabaseError);
      await expect(promise).rejects.toMatchObject({
        cause: expect.objectContaining({ name: 'ProvisionedThroughputExceededException' }),
      });
    });

    it('更新結果がない場合は素のErrorのまま日本語メッセージで投げる', async () => {
      mockDocClient.send.mockResolvedValueOnce({});

      const promise = repository.update('group-1', 'user-1', {});

      await expect(promise).rejects.toThrow('メンバーシップが見つかりません');
      await expect(promise).rejects.not.toBeInstanceOf(DatabaseError);
    });
  });
});
