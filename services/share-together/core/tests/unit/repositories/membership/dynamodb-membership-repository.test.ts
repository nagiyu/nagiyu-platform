/**
 * DynamoDBMembershipRepository のユニットテスト
 *
 * 単一アイテムの CRUD の振る舞い (エラー変換など) は EntityStore の責務のため、
 * ここでは正しいキーと保存形式で委譲していることと、独自の一覧 Query・一括削除だけを検証する。
 */

import {
  BatchWriteCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  DatabaseError,
  EntityAlreadyExistsError,
  EntityNotFoundError,
  InvalidEntityDataError,
} from '@nagiyu/aws';
import { DynamoDBMembershipRepository } from '../../../../src/repositories/membership/dynamodb-membership-repository.js';
import { parseUpdateExpression } from '../../../helpers/update-expression.js';

const TABLE_NAME = 'test-share-together-table';
const NOW = 1704067300000;
const CREATED_AT = 1704067200000;
const INVITED_AT = 1704153600000;
const EXPIRES_AT = INVITED_AT + 86400 * 1000;

function buildItem(userId: string, overrides: Record<string, unknown> = {}) {
  return {
    PK: 'GROUP#group-1',
    SK: `MEMBER#${userId}`,
    GSI1PK: `USER#${userId}`,
    GSI1SK: 'GROUP#group-1',
    Type: 'GroupMembership',
    GroupID: 'group-1',
    UserID: userId,
    Role: 'MEMBER',
    Status: 'ACCEPTED',
    CreatedAt: CREATED_AT,
    UpdatedAt: CREATED_AT,
    ...overrides,
  };
}

function conditionFailure(): Error {
  return Object.assign(new Error('conditional'), { name: 'ConditionalCheckFailedException' });
}

describe('DynamoDBMembershipRepository', () => {
  let repository: DynamoDBMembershipRepository;
  let mockDocClient: { send: jest.Mock };

  beforeEach(() => {
    // UpdatedAt は EntityStore が現在時刻で書くため、時刻を固定して検証する
    jest.useFakeTimers().setSystemTime(NOW);
    mockDocClient = { send: jest.fn() };
    repository = new DynamoDBMembershipRepository(
      mockDocClient as unknown as DynamoDBDocumentClient,
      TABLE_NAME
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('getById', () => {
    it('PK/SK で取得し Entity に変換する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: buildItem('user-1') });

      const result = await repository.getById('group-1', 'user-1');

      expect(result).toEqual({
        groupId: 'group-1',
        userId: 'user-1',
        role: 'MEMBER',
        status: 'ACCEPTED',
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      });
      const command = mockDocClient.send.mock.calls[0][0] as GetCommand;
      expect(command).toBeInstanceOf(GetCommand);
      expect(command.input.Key).toEqual({ PK: 'GROUP#group-1', SK: 'MEMBER#user-1' });
    });

    it('存在しない場合は null を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({});
      await expect(repository.getById('group-1', 'user-1')).resolves.toBeNull();
    });

    it('読めないデータは InvalidEntityDataError をスローする', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: buildItem('user-1', { Role: 'ADMIN' }) });
      await expect(repository.getById('group-1', 'user-1')).rejects.toThrow(InvalidEntityDataError);
    });
  });

  describe('getByGroupId', () => {
    it('PK と SK 接頭辞で Query し、Entity に変換して返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [buildItem('user-1'), buildItem('user-2', { Role: 'OWNER' })],
      });

      const result = await repository.getByGroupId('group-1');

      expect(result.map((membership) => membership.userId)).toEqual(['user-1', 'user-2']);
      expect(result[1].role).toBe('OWNER');
      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command).toBeInstanceOf(QueryCommand);
      expect(command.input.IndexName).toBeUndefined();
      expect(command.input.KeyConditionExpression).toBe(
        '#pk = :pk AND begins_with(#sk, :skPrefix)'
      );
      expect(command.input.ExpressionAttributeValues).toEqual({
        ':pk': 'GROUP#group-1',
        ':skPrefix': 'MEMBER#',
      });
    });

    it('複数ページにまたがる結果をすべて返す', async () => {
      mockDocClient.send
        .mockResolvedValueOnce({
          Items: [buildItem('user-1')],
          LastEvaluatedKey: { PK: 'GROUP#group-1', SK: 'MEMBER#user-1' },
        })
        .mockResolvedValueOnce({ Items: [buildItem('user-2')] });

      const result = await repository.getByGroupId('group-1');

      expect(result.map((membership) => membership.userId)).toEqual(['user-1', 'user-2']);
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);
    });

    it('旧形式のデータも読める', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [
          {
            PK: 'GROUP#group-1',
            SK: 'MEMBER#user-1',
            groupId: 'group-1',
            userId: 'user-1',
            role: 'MEMBER',
            status: 'PENDING',
            invitedBy: 'owner-1',
            invitedAt: '2024-01-02T00:00:00.000Z',
            TTL: EXPIRES_AT / 1000,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      });

      const [membership] = await repository.getByGroupId('group-1');

      expect(membership).toEqual({
        groupId: 'group-1',
        userId: 'user-1',
        role: 'MEMBER',
        status: 'PENDING',
        invitedBy: 'owner-1',
        invitedAt: INVITED_AT,
        expiresAt: EXPIRES_AT,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      });
    });

    it('SDK の例外は DatabaseError に包む', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('接続失敗'));
      await expect(repository.getByGroupId('group-1')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getByUserId', () => {
    it('GSI1 を Query し、Entity に変換して返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [buildItem('user-1')] });

      const result = await repository.getByUserId('user-1');

      expect(result).toHaveLength(1);
      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command.input.IndexName).toBe('GSI1');
      expect(command.input.KeyConditionExpression).toBe('#gsi1pk = :gsi1pk');
      expect(command.input.ExpressionAttributeValues).toEqual({ ':gsi1pk': 'USER#user-1' });
    });

    it('SDK の例外は DatabaseError に包む', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('接続失敗'));
      await expect(repository.getByUserId('user-1')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getPendingInvitationsByUserId', () => {
    it('新旧両方の status 属性を絞り込み条件で見る', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [] });

      await repository.getPendingInvitationsByUserId('user-1');

      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command.input.IndexName).toBe('GSI1');
      expect(command.input.FilterExpression).toBe('#status = :pending OR #legacyStatus = :pending');
      expect(command.input.ExpressionAttributeNames).toEqual({
        '#gsi1pk': 'GSI1PK',
        '#status': 'Status',
        '#legacyStatus': 'status',
      });
      expect(command.input.ExpressionAttributeValues).toEqual({
        ':gsi1pk': 'USER#user-1',
        ':pending': 'PENDING',
      });
    });

    it('新形式と旧形式の招待を Entity に変換して返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [
          buildItem('user-1', { Status: 'PENDING' }),
          {
            PK: 'GROUP#group-2',
            SK: 'MEMBER#user-1',
            GSI1PK: 'USER#user-1',
            GSI1SK: 'GROUP#group-2',
            groupId: 'group-2',
            userId: 'user-1',
            role: 'MEMBER',
            status: 'PENDING',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      });

      const result = await repository.getPendingInvitationsByUserId('user-1');

      expect(result.map((membership) => membership.groupId)).toEqual(['group-1', 'group-2']);
      expect(result.every((membership) => membership.status === 'PENDING')).toBe(true);
    });

    it('絞り込みをすり抜けた PENDING 以外は、変換後の status で除く', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [
          buildItem('user-1', { Status: 'PENDING' }),
          // 新形式の Status が ACCEPTED でも、旧名の status が PENDING のまま残ると条件を通る
          buildItem('user-1', { GroupID: 'group-2', Status: 'ACCEPTED', status: 'PENDING' }),
        ],
      });

      const result = await repository.getPendingInvitationsByUserId('user-1');

      expect(result.map((membership) => membership.groupId)).toEqual(['group-1']);
    });
  });

  describe('create', () => {
    it('保存形式の Item を条件付きで書き込み、Entity を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      const result = await repository.create({
        groupId: 'group-1',
        userId: 'user-1',
        role: 'MEMBER',
        status: 'PENDING',
        invitedBy: 'owner-1',
        invitedAt: INVITED_AT,
        expiresAt: EXPIRES_AT,
      });

      expect(result).toEqual({
        groupId: 'group-1',
        userId: 'user-1',
        role: 'MEMBER',
        status: 'PENDING',
        invitedBy: 'owner-1',
        invitedAt: INVITED_AT,
        expiresAt: EXPIRES_AT,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const command = mockDocClient.send.mock.calls[0][0] as PutCommand;
      expect(command).toBeInstanceOf(PutCommand);
      expect(command.input.Item).toEqual({
        PK: 'GROUP#group-1',
        SK: 'MEMBER#user-1',
        GSI1PK: 'USER#user-1',
        GSI1SK: 'GROUP#group-1',
        Type: 'GroupMembership',
        GroupID: 'group-1',
        UserID: 'user-1',
        Role: 'MEMBER',
        Status: 'PENDING',
        InvitedBy: 'owner-1',
        InvitedAt: INVITED_AT,
        TTL: EXPIRES_AT / 1000,
        CreatedAt: NOW,
        UpdatedAt: NOW,
      });
      expect(command.input.ConditionExpression).toBeDefined();
    });

    it('任意項目がなければ、その属性を書かない', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      await repository.create({
        groupId: 'group-1',
        userId: 'owner-1',
        role: 'OWNER',
        status: 'ACCEPTED',
      });

      const command = mockDocClient.send.mock.calls[0][0] as PutCommand;
      for (const name of ['InvitedBy', 'InvitedAt', 'RespondedAt', 'TTL']) {
        expect(command.input.Item).not.toHaveProperty(name);
      }
    });

    it('既に存在する場合は EntityAlreadyExistsError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(conditionFailure());

      await expect(
        repository.create({
          groupId: 'group-1',
          userId: 'user-1',
          role: 'MEMBER',
          status: 'PENDING',
        })
      ).rejects.toThrow(EntityAlreadyExistsError);
    });
  });

  describe('update', () => {
    it('保存用の属性名で更新し、旧名と UpdatedAt を整える', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: buildItem('user-1', { Status: 'ACCEPTED', RespondedAt: NOW, UpdatedAt: NOW }),
      });

      const result = await repository.update('group-1', 'user-1', {
        status: 'ACCEPTED',
        respondedAt: NOW,
        expiresAt: null,
      });

      expect(result).toMatchObject({ status: 'ACCEPTED', respondedAt: NOW });
      const command = mockDocClient.send.mock.calls[0][0] as UpdateCommand;
      expect(command).toBeInstanceOf(UpdateCommand);
      expect(command.input.Key).toEqual({ PK: 'GROUP#group-1', SK: 'MEMBER#user-1' });
      expect(command.input.ConditionExpression).toBeDefined();
      const parsed = parseUpdateExpression(command.input);
      expect(parsed.set).toEqual({
        Status: 'ACCEPTED',
        RespondedAt: NOW,
        GSI1PK: 'USER#user-1',
        GSI1SK: 'GROUP#group-1',
        UpdatedAt: NOW,
      });
      expect(parsed.remove).toEqual(
        expect.arrayContaining(['TTL', 'status', 'respondedAt', 'updatedAt'])
      );
    });

    it('expiresAt を TTL 属性のエポック秒で書く', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: buildItem('user-1', { Status: 'PENDING', TTL: EXPIRES_AT / 1000 }),
      });

      await repository.update('group-1', 'user-1', {
        status: 'PENDING',
        invitedAt: INVITED_AT,
        expiresAt: EXPIRES_AT,
        respondedAt: null,
      });

      const command = mockDocClient.send.mock.calls[0][0] as UpdateCommand;
      const parsed = parseUpdateExpression(command.input);
      expect(parsed.set).toMatchObject({
        InvitedAt: INVITED_AT,
        TTL: EXPIRES_AT / 1000,
      });
      expect(parsed.remove).toEqual(expect.arrayContaining(['RespondedAt', 'respondedAt']));
    });

    it('存在しない場合は EntityNotFoundError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(conditionFailure());

      await expect(repository.update('group-1', 'user-1', { status: 'ACCEPTED' })).rejects.toThrow(
        EntityNotFoundError
      );
    });

    it('必須項目を null にすると InvalidEntityDataError をスローする', async () => {
      await expect(
        repository.update('group-1', 'user-1', { status: null } as unknown as { status: 'PENDING' })
      ).rejects.toThrow(InvalidEntityDataError);
      expect(mockDocClient.send).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('存在を条件にして削除する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      await expect(repository.delete('group-1', 'user-1')).resolves.toBeUndefined();

      const command = mockDocClient.send.mock.calls[0][0] as DeleteCommand;
      expect(command).toBeInstanceOf(DeleteCommand);
      expect(command.input.Key).toEqual({ PK: 'GROUP#group-1', SK: 'MEMBER#user-1' });
      expect(command.input.ConditionExpression).toBeDefined();
    });

    it('存在しない場合は EntityNotFoundError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(conditionFailure());
      await expect(repository.delete('group-1', 'user-1')).rejects.toThrow(EntityNotFoundError);
    });

    it('SDK の例外は DatabaseError に包む', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('接続失敗'));
      await expect(repository.delete('group-1', 'user-1')).rejects.toThrow(DatabaseError);
    });
  });

  describe('deleteByGroupId', () => {
    it('キーだけを射影して Query し、条件なしで一括削除する', async () => {
      mockDocClient.send
        .mockResolvedValueOnce({
          Items: [
            { PK: 'GROUP#group-1', SK: 'MEMBER#user-1' },
            { PK: 'GROUP#group-1', SK: 'MEMBER#user-2' },
          ],
        })
        .mockResolvedValueOnce({ UnprocessedItems: {} });

      await repository.deleteByGroupId('group-1');

      const query = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(query).toBeInstanceOf(QueryCommand);
      expect(query.input.ExpressionAttributeValues).toEqual({
        ':pk': 'GROUP#group-1',
        ':skPrefix': 'MEMBER#',
      });
      expect(query.input.ProjectionExpression).toBe('#pk, #sk');
      const batch = mockDocClient.send.mock.calls[1][0] as BatchWriteCommand;
      expect(batch).toBeInstanceOf(BatchWriteCommand);
      expect(batch.input.RequestItems?.[TABLE_NAME]).toEqual([
        { DeleteRequest: { Key: { PK: 'GROUP#group-1', SK: 'MEMBER#user-1' } } },
        { DeleteRequest: { Key: { PK: 'GROUP#group-1', SK: 'MEMBER#user-2' } } },
      ]);
    });

    it('複数ページにまたがるメンバーシップをすべて削除する', async () => {
      mockDocClient.send
        .mockResolvedValueOnce({
          Items: [{ PK: 'GROUP#group-1', SK: 'MEMBER#user-1' }],
          LastEvaluatedKey: { PK: 'GROUP#group-1', SK: 'MEMBER#user-1' },
        })
        .mockResolvedValueOnce({ Items: [{ PK: 'GROUP#group-1', SK: 'MEMBER#user-2' }] })
        .mockResolvedValueOnce({ UnprocessedItems: {} });

      await repository.deleteByGroupId('group-1');

      const batch = mockDocClient.send.mock.calls[2][0] as BatchWriteCommand;
      expect(batch.input.RequestItems?.[TABLE_NAME]).toHaveLength(2);
    });

    it('メンバーシップがなければ削除を発行せず成功する (冪等)', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [] });

      await expect(repository.deleteByGroupId('group-1')).resolves.toBeUndefined();

      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('読めないメンバーシップがあっても削除できる', async () => {
      // 本文を取得しないため、壊れたアイテムがカスケード削除を止めない
      mockDocClient.send
        .mockResolvedValueOnce({ Items: [{ PK: 'GROUP#group-1', SK: 'MEMBER#broken' }] })
        .mockResolvedValueOnce({ UnprocessedItems: {} });

      await expect(repository.deleteByGroupId('group-1')).resolves.toBeUndefined();
    });

    it('Query の例外は DatabaseError に包む', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('接続失敗'));
      await expect(repository.deleteByGroupId('group-1')).rejects.toThrow(DatabaseError);
    });

    it('一括削除の例外は DatabaseError に包む', async () => {
      mockDocClient.send
        .mockResolvedValueOnce({ Items: [{ PK: 'GROUP#group-1', SK: 'MEMBER#user-1' }] })
        .mockRejectedValueOnce(new Error('接続失敗'));
      await expect(repository.deleteByGroupId('group-1')).rejects.toThrow(DatabaseError);
    });
  });
});
