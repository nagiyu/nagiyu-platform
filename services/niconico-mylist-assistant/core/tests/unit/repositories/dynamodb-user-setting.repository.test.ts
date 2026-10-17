/**
 * DynamoDB UserSetting Repository のテスト
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { DynamoDBUserSettingRepository } from '../../../src/repositories/dynamodb-user-setting.repository.js';
import { EntityAlreadyExistsError, EntityNotFoundError, DatabaseError } from '@nagiyu/aws';
import { parseUpdateExpression } from '../../helpers/update-expression.js';
import type {
  CreateUserSettingInput,
  UpdateUserSettingInput,
} from '../../../src/entities/user-setting.entity.js';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('DynamoDBUserSettingRepository', () => {
  let repository: DynamoDBUserSettingRepository;
  const tableName = 'test-table';

  beforeEach(() => {
    ddbMock.reset();
    const docClient = ddbMock as unknown as DynamoDBDocumentClient;
    repository = new DynamoDBUserSettingRepository(docClient, tableName);
  });

  describe('getById', () => {
    it('存在するユーザー設定を取得できる', async () => {
      const mockItem = {
        PK: 'USER#user-123',
        SK: 'VIDEO#video-456',
        Type: 'USER_SETTING',
        UserID: 'user-123',
        VideoID: 'video-456',
        IsFavorite: true,
        IsSkip: false,
        CreatedAt: 1234567890000,
        UpdatedAt: 1234567890000,
      };

      ddbMock.on(GetCommand).resolves({
        Item: mockItem,
      });

      const result = await repository.getById('user-123', 'video-456');

      expect(result).not.toBeNull();
      expect(result?.userId).toBe('user-123');
      expect(result?.videoId).toBe('video-456');
      expect(result?.isFavorite).toBe(true);
    });

    it('旧属性名 (camelCase) のアイテムも取得できる', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          PK: 'USER#user-123',
          SK: 'VIDEO#video-456',
          Type: 'USER_SETTING',
          userId: 'user-123',
          videoId: 'video-456',
          isFavorite: true,
          isSkip: false,
          memo: '旧メモ',
          CreatedAt: 1234567890000,
          UpdatedAt: 1234567890000,
        },
      });

      const result = await repository.getById('user-123', 'video-456');

      expect(result).toEqual({
        userId: 'user-123',
        videoId: 'video-456',
        isFavorite: true,
        isSkip: false,
        memo: '旧メモ',
        createdAt: 1234567890000,
        updatedAt: 1234567890000,
      });
    });

    it('存在しないユーザー設定はnullを返す', async () => {
      ddbMock.on(GetCommand).resolves({});

      const result = await repository.getById('user-123', 'video-456');

      expect(result).toBeNull();
    });

    it('DynamoDBエラーの場合はDatabaseErrorをスローする', async () => {
      ddbMock.on(GetCommand).rejects(new Error('DynamoDB error'));

      await expect(repository.getById('user-123', 'video-456')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getByUserId', () => {
    it('ユーザーの全設定を取得できる', async () => {
      const mockItems = [
        {
          PK: 'USER#user-123',
          SK: 'VIDEO#video-1',
          Type: 'USER_SETTING',
          UserID: 'user-123',
          VideoID: 'video-1',
          IsFavorite: true,
          IsSkip: false,
          CreatedAt: 1234567890000,
          UpdatedAt: 1234567890000,
        },
        {
          PK: 'USER#user-123',
          SK: 'VIDEO#video-2',
          Type: 'USER_SETTING',
          UserID: 'user-123',
          VideoID: 'video-2',
          IsFavorite: false,
          IsSkip: true,
          CreatedAt: 1234567890000,
          UpdatedAt: 1234567890000,
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 2,
      });

      const result = await repository.getByUserId('user-123');

      expect(result.items).toHaveLength(2);
      expect(result.items[0].videoId).toBe('video-1');
      expect(result.items[1].videoId).toBe('video-2');
      expect(result.count).toBe(2);
      expect(result.nextCursor).toBeUndefined();
    });

    it('ページネーションカーソルを使用できる', async () => {
      const lastEvaluatedKey = { PK: 'USER#user-123', SK: 'VIDEO#video-1' };
      const cursor = Buffer.from(JSON.stringify(lastEvaluatedKey)).toString('base64');

      ddbMock.on(QueryCommand).resolves({
        Items: [],
        Count: 0,
        LastEvaluatedKey: lastEvaluatedKey,
      });

      const result = await repository.getByUserId('user-123', { cursor });

      expect(result.nextCursor).toBeDefined();
    });

    it('DynamoDBエラーの場合はDatabaseErrorをスローする', async () => {
      ddbMock.on(QueryCommand).rejects(new Error('DynamoDB error'));

      await expect(repository.getByUserId('user-123')).rejects.toThrow(DatabaseError);
    });

    it('memoが空文字でも取得できる', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            PK: 'USER#user-123',
            SK: 'VIDEO#video-1',
            Type: 'USER_SETTING',
            UserID: 'user-123',
            VideoID: 'video-1',
            IsFavorite: false,
            IsSkip: false,
            Memo: '',
            CreatedAt: 1234567890000,
            UpdatedAt: 1234567890000,
          },
        ],
        Count: 1,
      });

      const result = await repository.getByUserId('user-123');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].memo).toBe('');
    });
  });

  describe('getByUserIdWithFilters', () => {
    it('isFavoriteフィルタでフィルタリングできる', async () => {
      const mockItems = [
        {
          PK: 'USER#user-123',
          SK: 'VIDEO#video-1',
          Type: 'USER_SETTING',
          UserID: 'user-123',
          VideoID: 'video-1',
          IsFavorite: true,
          IsSkip: false,
          CreatedAt: 1234567890000,
          UpdatedAt: 1234567890000,
        },
        {
          PK: 'USER#user-123',
          SK: 'VIDEO#video-2',
          Type: 'USER_SETTING',
          UserID: 'user-123',
          VideoID: 'video-2',
          IsFavorite: false,
          IsSkip: false,
          CreatedAt: 1234567890000,
          UpdatedAt: 1234567890000,
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 2,
      });

      const result = await repository.getByUserIdWithFilters('user-123', { isFavorite: true });

      expect(result.settings).toHaveLength(1);
      expect(result.settings[0].videoId).toBe('video-1');
      expect(result.total).toBe(1);
    });

    it('isSkipフィルタでフィルタリングできる', async () => {
      const mockItems = [
        {
          PK: 'USER#user-123',
          SK: 'VIDEO#video-1',
          Type: 'USER_SETTING',
          UserID: 'user-123',
          VideoID: 'video-1',
          IsFavorite: false,
          IsSkip: true,
          CreatedAt: 1234567890000,
          UpdatedAt: 1234567890000,
        },
        {
          PK: 'USER#user-123',
          SK: 'VIDEO#video-2',
          Type: 'USER_SETTING',
          UserID: 'user-123',
          VideoID: 'video-2',
          IsFavorite: false,
          IsSkip: false,
          CreatedAt: 1234567890000,
          UpdatedAt: 1234567890000,
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 2,
      });

      const result = await repository.getByUserIdWithFilters('user-123', { isSkip: true });

      expect(result.settings).toHaveLength(1);
      expect(result.settings[0].isSkip).toBe(true);
      expect(result.total).toBe(1);
    });

    it('複数フィルタを組み合わせることができる', async () => {
      const mockItems = [
        {
          PK: 'USER#user-123',
          SK: 'VIDEO#video-1',
          Type: 'USER_SETTING',
          UserID: 'user-123',
          VideoID: 'video-1',
          IsFavorite: true,
          IsSkip: true,
          CreatedAt: 1234567890000,
          UpdatedAt: 1234567890000,
        },
        {
          PK: 'USER#user-123',
          SK: 'VIDEO#video-2',
          Type: 'USER_SETTING',
          UserID: 'user-123',
          VideoID: 'video-2',
          IsFavorite: true,
          IsSkip: false,
          CreatedAt: 1234567890000,
          UpdatedAt: 1234567890000,
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 2,
      });

      const result = await repository.getByUserIdWithFilters('user-123', {
        isFavorite: true,
        isSkip: true,
      });

      expect(result.settings).toHaveLength(1);
      expect(result.settings[0].videoId).toBe('video-1');
    });

    it('ページネーションオプションを使用できる', async () => {
      const mockItems = Array.from({ length: 10 }, (_, i) => ({
        PK: 'USER#user-123',
        SK: `VIDEO#video-${i}`,
        Type: 'USER_SETTING',
        UserID: 'user-123',
        VideoID: `video-${i}`,
        IsFavorite: false,
        IsSkip: false,
        CreatedAt: 1234567890000,
        UpdatedAt: 1234567890000,
      }));

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 10,
      });

      const result = await repository.getByUserIdWithFilters(
        'user-123',
        {},
        { limit: 5, offset: 2 }
      );

      expect(result.settings).toHaveLength(5);
      expect(result.total).toBe(10);
    });
  });

  describe('create', () => {
    it('新しいユーザー設定を作成できる', async () => {
      ddbMock.on(PutCommand).resolves({});

      const input: CreateUserSettingInput = {
        userId: 'user-123',
        videoId: 'video-456',
        isFavorite: true,
        isSkip: false,
      };

      const result = await repository.create({ ...input, memo: 'メモ' });

      expect(result.userId).toBe(input.userId);
      expect(result.videoId).toBe(input.videoId);
      expect(result.isFavorite).toBe(input.isFavorite);
      expect(result.createdAt).toBeGreaterThan(0);
      expect(result.updatedAt).toBeGreaterThan(0);

      const putInput = ddbMock.commandCalls(PutCommand)[0].args[0].input;
      expect(putInput.Item).toEqual({
        PK: 'USER#user-123',
        SK: 'VIDEO#video-456',
        Type: 'USER_SETTING',
        UserID: 'user-123',
        VideoID: 'video-456',
        IsFavorite: true,
        IsSkip: false,
        Memo: 'メモ',
        CreatedAt: result.createdAt,
        UpdatedAt: result.updatedAt,
      });
    });

    it('同じキーで重複作成するとEntityAlreadyExistsErrorをスローする', async () => {
      const error = new Error('ConditionalCheckFailedException');
      error.name = 'ConditionalCheckFailedException';
      ddbMock.on(PutCommand).rejects(error);

      const input: CreateUserSettingInput = {
        userId: 'user-123',
        videoId: 'video-456',
        isFavorite: true,
        isSkip: false,
      };

      await expect(repository.create(input)).rejects.toThrow(EntityAlreadyExistsError);
    });

    it('DynamoDBエラーの場合はDatabaseErrorをスローする', async () => {
      ddbMock.on(PutCommand).rejects(new Error('DynamoDB error'));

      const input: CreateUserSettingInput = {
        userId: 'user-123',
        videoId: 'video-456',
        isFavorite: true,
        isSkip: false,
      };

      await expect(repository.create(input)).rejects.toThrow(DatabaseError);
    });
  });

  describe('upsert', () => {
    it('新しいユーザー設定を作成できる', async () => {
      ddbMock.on(GetCommand).resolves({});
      ddbMock.on(PutCommand).resolves({});

      const input: CreateUserSettingInput = {
        userId: 'user-123',
        videoId: 'video-456',
        isFavorite: true,
        isSkip: false,
      };

      const result = await repository.upsert(input);

      expect(result.userId).toBe(input.userId);
      expect(result.videoId).toBe(input.videoId);
      expect(result.isFavorite).toBe(input.isFavorite);
    });

    it('既存のユーザー設定を更新できる（CreatedAtを保持）', async () => {
      const existingCreatedAt = 1234567890000;
      ddbMock.on(GetCommand).resolves({
        Item: {
          PK: 'USER#user-123',
          SK: 'VIDEO#video-456',
          Type: 'USER_SETTING',
          UserID: 'user-123',
          VideoID: 'video-456',
          IsFavorite: false,
          IsSkip: false,
          CreatedAt: existingCreatedAt,
          UpdatedAt: 1234567890000,
        },
      });
      ddbMock.on(PutCommand).resolves({});

      const input: CreateUserSettingInput = {
        userId: 'user-123',
        videoId: 'video-456',
        isFavorite: true,
        isSkip: false,
      };

      const result = await repository.upsert(input);

      expect(result.createdAt).toBe(existingCreatedAt);
      expect(result.updatedAt).toBeGreaterThan(existingCreatedAt);
      expect(ddbMock.commandCalls(PutCommand)[0].args[0].input.Item).toMatchObject({
        CreatedAt: existingCreatedAt,
        IsFavorite: true,
      });
    });

    it('DynamoDBエラーの場合はDatabaseErrorをスローする', async () => {
      ddbMock.on(GetCommand).resolves({});
      ddbMock.on(PutCommand).rejects(new Error('DynamoDB error'));

      const input: CreateUserSettingInput = {
        userId: 'user-123',
        videoId: 'video-456',
        isFavorite: true,
        isSkip: false,
      };

      await expect(repository.upsert(input)).rejects.toThrow(DatabaseError);
    });
  });

  describe('update', () => {
    it('isFavoriteフィールドを更新できる', async () => {
      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          PK: 'USER#user-123',
          SK: 'VIDEO#video-456',
          Type: 'USER_SETTING',
          UserID: 'user-123',
          VideoID: 'video-456',
          IsFavorite: true,
          IsSkip: false,
          CreatedAt: 1234567890000,
          UpdatedAt: Date.now(),
        },
      });

      const updates: UpdateUserSettingInput = {
        isFavorite: true,
      };

      const result = await repository.update('user-123', 'video-456', updates);

      expect(result.isFavorite).toBe(true);
      // 新名で書き、同時に旧名を削除して二重に残さない
      const parsed = parseUpdateExpression(ddbMock.commandCalls(UpdateCommand)[0].args[0].input);
      expect(parsed.set).toEqual({ IsFavorite: true, UpdatedAt: expect.any(Number) });
      expect(parsed.remove).toEqual(['isFavorite']);
    });

    it('isSkipフィールドを更新できる', async () => {
      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          PK: 'USER#user-123',
          SK: 'VIDEO#video-456',
          Type: 'USER_SETTING',
          UserID: 'user-123',
          VideoID: 'video-456',
          IsFavorite: false,
          IsSkip: true,
          CreatedAt: 1234567890000,
          UpdatedAt: Date.now(),
        },
      });

      const updates: UpdateUserSettingInput = {
        isSkip: true,
      };

      const result = await repository.update('user-123', 'video-456', updates);

      expect(result.isSkip).toBe(true);
    });

    it('memoフィールドを更新できる', async () => {
      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          PK: 'USER#user-123',
          SK: 'VIDEO#video-456',
          Type: 'USER_SETTING',
          UserID: 'user-123',
          VideoID: 'video-456',
          IsFavorite: false,
          IsSkip: false,
          Memo: 'test memo',
          CreatedAt: 1234567890000,
          UpdatedAt: Date.now(),
        },
      });

      const updates: UpdateUserSettingInput = {
        memo: 'test memo',
      };

      const result = await repository.update('user-123', 'video-456', updates);

      expect(result.memo).toBe('test memo');
    });

    it('複数フィールドを同時に更新できる', async () => {
      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          PK: 'USER#user-123',
          SK: 'VIDEO#video-456',
          Type: 'USER_SETTING',
          UserID: 'user-123',
          VideoID: 'video-456',
          IsFavorite: true,
          IsSkip: true,
          Memo: 'test memo',
          CreatedAt: 1234567890000,
          UpdatedAt: Date.now(),
        },
      });

      const updates: UpdateUserSettingInput = {
        isFavorite: true,
        isSkip: true,
        memo: 'test memo',
      };

      const result = await repository.update('user-123', 'video-456', updates);

      expect(result.isFavorite).toBe(true);
      expect(result.isSkip).toBe(true);
      expect(result.memo).toBe('test memo');
    });

    it('更新フィールドが指定されていない場合は更新日時だけを更新する', async () => {
      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          PK: 'USER#user-123',
          SK: 'VIDEO#video-456',
          Type: 'USER_SETTING',
          UserID: 'user-123',
          VideoID: 'video-456',
          IsFavorite: false,
          IsSkip: false,
          CreatedAt: 1234567890000,
          UpdatedAt: Date.now(),
        },
      });

      await repository.update('user-123', 'video-456', {});

      const parsed = parseUpdateExpression(ddbMock.commandCalls(UpdateCommand)[0].args[0].input);
      expect(parsed.set).toEqual({ UpdatedAt: expect.any(Number) });
    });

    it('memoをnullにすると属性を削除する', async () => {
      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          PK: 'USER#user-123',
          SK: 'VIDEO#video-456',
          Type: 'USER_SETTING',
          UserID: 'user-123',
          VideoID: 'video-456',
          IsFavorite: false,
          IsSkip: false,
          CreatedAt: 1234567890000,
          UpdatedAt: Date.now(),
        },
      });

      const result = await repository.update('user-123', 'video-456', { memo: null });

      expect(result.memo).toBeUndefined();
      const parsed = parseUpdateExpression(ddbMock.commandCalls(UpdateCommand)[0].args[0].input);
      expect(parsed.remove).toEqual(expect.arrayContaining(['Memo', 'memo']));
    });

    it('存在しない設定を更新するとEntityNotFoundErrorをスローする', async () => {
      const error = new Error('ConditionalCheckFailedException');
      error.name = 'ConditionalCheckFailedException';
      ddbMock.on(UpdateCommand).rejects(error);

      const updates: UpdateUserSettingInput = {
        isFavorite: true,
      };

      await expect(repository.update('user-123', 'video-456', updates)).rejects.toThrow(
        EntityNotFoundError
      );
    });

    it('DynamoDBエラーの場合はDatabaseErrorをスローする', async () => {
      ddbMock.on(UpdateCommand).rejects(new Error('DynamoDB error'));

      const updates: UpdateUserSettingInput = {
        isFavorite: true,
      };

      await expect(repository.update('user-123', 'video-456', updates)).rejects.toThrow(
        DatabaseError
      );
    });
  });

  describe('delete', () => {
    it('ユーザー設定を削除できる', async () => {
      ddbMock.on(DeleteCommand).resolves({});

      await expect(repository.delete('user-123', 'video-456')).resolves.not.toThrow();
    });

    it('存在しない設定を削除するとEntityNotFoundErrorをスローする', async () => {
      const error = new Error('ConditionalCheckFailedException');
      error.name = 'ConditionalCheckFailedException';
      ddbMock.on(DeleteCommand).rejects(error);

      await expect(repository.delete('user-123', 'video-456')).rejects.toThrow(EntityNotFoundError);
    });

    it('DynamoDBエラーの場合はDatabaseErrorをスローする', async () => {
      ddbMock.on(DeleteCommand).rejects(new Error('DynamoDB error'));

      await expect(repository.delete('user-123', 'video-456')).rejects.toThrow(DatabaseError);
    });
  });
});
