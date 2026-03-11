import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DynamoDBUserRepository } from '../../../../src/repositories/user/dynamodb-user-repository.js';

describe('DynamoDBUserRepository', () => {
  const TABLE_NAME = 'test-share-together-main';
  let repository: DynamoDBUserRepository;
  let mockDocClient: { send: jest.Mock };

  beforeEach(() => {
    mockDocClient = {
      send: jest.fn(),
    };

    repository = new DynamoDBUserRepository(
      mockDocClient as unknown as DynamoDBDocumentClient,
      TABLE_NAME
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getById', () => {
    it('ユーザーIDでユーザーを取得できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'USER#user-1',
          SK: '#META#',
          GSI2PK: 'EMAIL#test@example.com',
          userId: 'user-1',
          email: 'test@example.com',
          name: 'テストユーザー',
          image: 'https://example.com/image.png',
          defaultListId: 'list-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      });

      const result = await repository.getById('user-1');
      const command = mockDocClient.send.mock.calls[0]?.[0] as GetCommand;

      expect(result).toEqual({
        userId: 'user-1',
        email: 'test@example.com',
        name: 'テストユーザー',
        image: 'https://example.com/image.png',
        defaultListId: 'list-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      expect(command.input).toEqual({
        TableName: TABLE_NAME,
        Key: {
          PK: 'USER#user-1',
          SK: '#META#',
        },
      });
    });

    it('ユーザーが存在しない場合はnullを返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: undefined });

      const result = await repository.getById('user-404');

      expect(result).toBeNull();
    });
  });

  describe('getByEmail', () => {
    it('メールアドレスでユーザーを取得できる（GSI2）', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [
          {
            PK: 'USER#user-1',
            SK: '#META#',
            GSI2PK: 'EMAIL#test@example.com',
            userId: 'user-1',
            email: 'test@example.com',
            name: 'テストユーザー',
            defaultListId: 'list-1',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      });

      const result = await repository.getByEmail('test@example.com');
      const command = mockDocClient.send.mock.calls[0]?.[0] as QueryCommand;

      expect(result).toEqual({
        userId: 'user-1',
        email: 'test@example.com',
        name: 'テストユーザー',
        image: undefined,
        defaultListId: 'list-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      expect(command.input).toEqual({
        TableName: TABLE_NAME,
        IndexName: 'GSI2',
        KeyConditionExpression: '#gsi2pk = :gsi2pk',
        ExpressionAttributeNames: {
          '#gsi2pk': 'GSI2PK',
        },
        ExpressionAttributeValues: {
          ':gsi2pk': 'EMAIL#test@example.com',
        },
        Limit: 1,
      });
    });

    it('該当ユーザーがない場合はnullを返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [] });

      const result = await repository.getByEmail('notfound@example.com');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('新規ユーザーを作成できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({});

      const input = {
        userId: 'user-new',
        email: 'new@example.com',
        name: '新規ユーザー',
        image: 'https://example.com/new.png',
        defaultListId: 'list-new',
      };

      const result = await repository.create(input);
      const command = mockDocClient.send.mock.calls[0]?.[0] as PutCommand;

      expect(result).toMatchObject({
        userId: 'user-new',
        email: 'new@example.com',
        name: '新規ユーザー',
        image: 'https://example.com/new.png',
        defaultListId: 'list-new',
      });
      expect(typeof result.createdAt).toBe('string');
      expect(typeof result.updatedAt).toBe('string');

      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        Item: {
          PK: 'USER#user-new',
          SK: '#META#',
          GSI2PK: 'EMAIL#new@example.com',
          userId: 'user-new',
          email: 'new@example.com',
          name: '新規ユーザー',
          image: 'https://example.com/new.png',
          defaultListId: 'list-new',
        },
        ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      });
    });

    it('imageなしでユーザーを作成できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({});

      const input = {
        userId: 'user-no-image',
        email: 'noimage@example.com',
        name: '画像なしユーザー',
        defaultListId: 'list-no-image',
      };

      const result = await repository.create(input);

      expect(result).toMatchObject({
        userId: 'user-no-image',
        email: 'noimage@example.com',
        name: '画像なしユーザー',
        defaultListId: 'list-no-image',
        image: undefined,
      });
    });

    it('ユーザーが既に存在する場合はエラーを投げる', async () => {
      const conditionalError = new Error('ConditionalCheckFailedException');
      conditionalError.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(conditionalError);

      await expect(
        repository.create({
          userId: 'user-dup',
          email: 'dup@example.com',
          name: '重複ユーザー',
          defaultListId: 'list-dup',
        })
      ).rejects.toThrow('ユーザーは既に存在します');
    });

    it('DynamoDBエラーはそのまま再スローされる', async () => {
      const dbError = new Error('DynamoDB接続エラー');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(
        repository.create({
          userId: 'user-err',
          email: 'err@example.com',
          name: 'エラーユーザー',
          defaultListId: 'list-err',
        })
      ).rejects.toThrow('DynamoDB接続エラー');
    });
  });

  describe('update', () => {
    const updatedAttributes = {
      PK: 'USER#user-1',
      SK: '#META#',
      GSI2PK: 'EMAIL#updated@example.com',
      userId: 'user-1',
      email: 'updated@example.com',
      name: '更新後ユーザー',
      image: 'https://example.com/updated.png',
      defaultListId: 'list-updated',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    };

    it('ユーザー情報を更新できる（全フィールド）', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Attributes: updatedAttributes });

      const result = await repository.update('user-1', {
        email: 'updated@example.com',
        name: '更新後ユーザー',
        image: 'https://example.com/updated.png',
        defaultListId: 'list-updated',
      });
      const command = mockDocClient.send.mock.calls[0]?.[0] as UpdateCommand;

      expect(result).toEqual({
        userId: 'user-1',
        email: 'updated@example.com',
        name: '更新後ユーザー',
        image: 'https://example.com/updated.png',
        defaultListId: 'list-updated',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
      });
      expect(command.input.TableName).toBe(TABLE_NAME);
      expect(command.input.Key).toEqual({ PK: 'USER#user-1', SK: '#META#' });
      expect(command.input.ConditionExpression).toBe(
        'attribute_exists(PK) AND attribute_exists(SK)'
      );
      expect(command.input.ReturnValues).toBe('ALL_NEW');
    });

    it('メール更新時にGSI2PKも更新される', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Attributes: updatedAttributes });

      await repository.update('user-1', { email: 'updated@example.com' });
      const command = mockDocClient.send.mock.calls[0]?.[0] as UpdateCommand;

      expect(command.input.ExpressionAttributeNames).toHaveProperty('#gsi2pk', 'GSI2PK');
      expect(command.input.ExpressionAttributeValues).toHaveProperty(
        ':gsi2pk',
        'EMAIL#updated@example.com'
      );
    });

    it('nameのみ更新できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: {
          ...updatedAttributes,
          name: '名前だけ変更',
        },
      });

      const result = await repository.update('user-1', { name: '名前だけ変更' });
      const command = mockDocClient.send.mock.calls[0]?.[0] as UpdateCommand;

      expect(result.name).toBe('名前だけ変更');
      expect(command.input.ExpressionAttributeNames).not.toHaveProperty('#email');
      expect(command.input.ExpressionAttributeNames).toHaveProperty('#name', 'name');
    });

    it('ユーザーが存在しない場合はエラーを投げる', async () => {
      const conditionalError = new Error('ConditionalCheckFailedException');
      conditionalError.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(conditionalError);

      await expect(repository.update('user-404', { name: '存在しない' })).rejects.toThrow(
        'ユーザーが見つかりません'
      );
    });

    it('DynamoDBエラーはそのまま再スローされる', async () => {
      const dbError = new Error('DynamoDB接続エラー');
      mockDocClient.send.mockRejectedValueOnce(dbError);

      await expect(repository.update('user-err', { name: 'エラー' })).rejects.toThrow(
        'DynamoDB接続エラー'
      );
    });
  });

  describe('delete', () => {
    it('ユーザーを削除できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({});

      await repository.delete('user-1');
      const command = mockDocClient.send.mock.calls[0]?.[0] as DeleteCommand;

      expect(command.input).toEqual({
        TableName: TABLE_NAME,
        Key: {
          PK: 'USER#user-1',
          SK: '#META#',
        },
      });
    });

    it('存在しないユーザーを削除してもエラーにならない', async () => {
      mockDocClient.send.mockResolvedValueOnce({});

      await expect(repository.delete('user-404')).resolves.toBeUndefined();
    });
  });
});
