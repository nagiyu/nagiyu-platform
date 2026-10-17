/**
 * DynamoDBTodoRepository のユニットテスト
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
import { DynamoDBTodoRepository } from '../../../../src/repositories/todo/dynamodb-todo-repository.js';
import { parseUpdateExpression } from '../../../helpers/update-expression.js';

const TABLE_NAME = 'test-share-together-table';
const NOW = 1704067300000;
const CREATED_AT = 1704067200000;

function buildItem(todoId: string, overrides: Record<string, unknown> = {}) {
  return {
    PK: 'LIST#list-1',
    SK: `TODO#${todoId}`,
    Type: 'TodoItem',
    TodoID: todoId,
    ListID: 'list-1',
    Title: `タイトル-${todoId}`,
    IsCompleted: false,
    CreatedBy: 'user-1',
    CreatedAt: CREATED_AT,
    UpdatedAt: CREATED_AT,
    ...overrides,
  };
}

function conditionFailure(): Error {
  return Object.assign(new Error('conditional'), { name: 'ConditionalCheckFailedException' });
}

describe('DynamoDBTodoRepository', () => {
  let repository: DynamoDBTodoRepository;
  let mockDocClient: { send: jest.Mock };

  beforeEach(() => {
    // UpdatedAt は EntityStore が現在時刻で書くため、時刻を固定して検証する
    jest.useFakeTimers().setSystemTime(NOW);
    mockDocClient = { send: jest.fn() };
    repository = new DynamoDBTodoRepository(
      mockDocClient as unknown as DynamoDBDocumentClient,
      TABLE_NAME
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('getByListId', () => {
    it('PK と SK 接頭辞で Query し、Entity に変換して返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [buildItem('a'), buildItem('b', { IsCompleted: true, CompletedBy: 'user-2' })],
      });

      const result = await repository.getByListId('list-1');

      expect(result.map((todo) => todo.todoId)).toEqual(['a', 'b']);
      expect(result[0]).toEqual({
        todoId: 'a',
        listId: 'list-1',
        title: 'タイトル-a',
        isCompleted: false,
        createdBy: 'user-1',
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      });
      expect(result[1]).toMatchObject({ isCompleted: true, completedBy: 'user-2' });
      const command = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(command).toBeInstanceOf(QueryCommand);
      expect(command.input.TableName).toBe(TABLE_NAME);
      expect(command.input.KeyConditionExpression).toBe(
        '#pk = :pk AND begins_with(#sk, :skPrefix)'
      );
      expect(command.input.ExpressionAttributeValues).toEqual({
        ':pk': 'LIST#list-1',
        ':skPrefix': 'TODO#',
      });
    });

    it('複数ページにまたがる結果をすべて返す', async () => {
      mockDocClient.send
        .mockResolvedValueOnce({
          Items: [buildItem('a')],
          LastEvaluatedKey: { PK: 'LIST#list-1', SK: 'TODO#a' },
        })
        .mockResolvedValueOnce({ Items: [buildItem('b')] });

      const result = await repository.getByListId('list-1');

      expect(result.map((todo) => todo.todoId)).toEqual(['a', 'b']);
      expect(mockDocClient.send).toHaveBeenCalledTimes(2);
    });

    it('旧形式のデータも読める', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [
          {
            PK: 'LIST#list-1',
            SK: 'TODO#a',
            todoId: 'a',
            listId: 'list-1',
            title: '旧',
            isCompleted: true,
            createdBy: 'user-1',
            completedBy: 'user-2',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      });

      const [todo] = await repository.getByListId('list-1');

      expect(todo).toEqual({
        todoId: 'a',
        listId: 'list-1',
        title: '旧',
        isCompleted: true,
        createdBy: 'user-1',
        completedBy: 'user-2',
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      });
    });

    it('読めないデータは InvalidEntityDataError をスローする', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [buildItem('a', { IsCompleted: undefined })],
      });
      await expect(repository.getByListId('list-1')).rejects.toThrow(InvalidEntityDataError);
    });

    it('SDK の例外は DatabaseError に包む', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('接続失敗'));
      await expect(repository.getByListId('list-1')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getById', () => {
    it('PK/SK で取得し Entity に変換する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: buildItem('a') });

      const result = await repository.getById('list-1', 'a');

      expect(result).toMatchObject({ todoId: 'a', listId: 'list-1', title: 'タイトル-a' });
      const command = mockDocClient.send.mock.calls[0][0] as GetCommand;
      expect(command).toBeInstanceOf(GetCommand);
      expect(command.input.Key).toEqual({ PK: 'LIST#list-1', SK: 'TODO#a' });
    });

    it('存在しない場合は null を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({});
      await expect(repository.getById('list-1', 'a')).resolves.toBeNull();
    });
  });

  describe('create', () => {
    it('保存形式の Item を条件付きで書き込み、Entity を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      const result = await repository.create({
        todoId: 'a',
        listId: 'list-1',
        title: '牛乳',
        isCompleted: false,
        createdBy: 'user-1',
      });

      expect(result).toEqual({
        todoId: 'a',
        listId: 'list-1',
        title: '牛乳',
        isCompleted: false,
        createdBy: 'user-1',
        createdAt: NOW,
        updatedAt: NOW,
      });
      const command = mockDocClient.send.mock.calls[0][0] as PutCommand;
      expect(command).toBeInstanceOf(PutCommand);
      expect(command.input.Item).toEqual({
        PK: 'LIST#list-1',
        SK: 'TODO#a',
        Type: 'TodoItem',
        TodoID: 'a',
        ListID: 'list-1',
        Title: '牛乳',
        IsCompleted: false,
        CreatedBy: 'user-1',
        CreatedAt: NOW,
        UpdatedAt: NOW,
      });
      expect(command.input.ConditionExpression).toBeDefined();
    });

    it('既に存在する場合は EntityAlreadyExistsError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(conditionFailure());

      await expect(
        repository.create({
          todoId: 'a',
          listId: 'list-1',
          title: 't',
          isCompleted: false,
          createdBy: 'user-1',
        })
      ).rejects.toThrow(EntityAlreadyExistsError);
    });
  });

  describe('update', () => {
    it('保存用の属性名で更新し、旧名と UpdatedAt を整える', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: buildItem('a', {
          Title: '新',
          IsCompleted: true,
          CompletedBy: 'user-2',
          UpdatedAt: NOW,
        }),
      });

      const result = await repository.update('list-1', 'a', {
        title: '新',
        isCompleted: true,
        completedBy: 'user-2',
      });

      expect(result).toMatchObject({ title: '新', isCompleted: true, completedBy: 'user-2' });
      const command = mockDocClient.send.mock.calls[0][0] as UpdateCommand;
      expect(command).toBeInstanceOf(UpdateCommand);
      expect(command.input.Key).toEqual({ PK: 'LIST#list-1', SK: 'TODO#a' });
      const parsed = parseUpdateExpression(command.input);
      expect(parsed.set).toEqual({
        Title: '新',
        IsCompleted: true,
        CompletedBy: 'user-2',
        UpdatedAt: NOW,
      });
      expect(parsed.remove).toEqual(
        expect.arrayContaining(['title', 'isCompleted', 'completedBy', 'updatedAt'])
      );
    });

    it('completedBy に null を渡すと CompletedBy を REMOVE する', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: buildItem('a', { UpdatedAt: NOW }),
      });

      const result = await repository.update('list-1', 'a', {
        isCompleted: false,
        completedBy: null,
      });

      expect(result).not.toHaveProperty('completedBy');
      const command = mockDocClient.send.mock.calls[0][0] as UpdateCommand;
      const parsed = parseUpdateExpression(command.input);
      expect(parsed.set).toEqual({ IsCompleted: false, UpdatedAt: NOW });
      expect(parsed.remove).toEqual(expect.arrayContaining(['CompletedBy', 'completedBy']));
    });

    it('存在しない場合は EntityNotFoundError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(conditionFailure());

      await expect(repository.update('list-1', 'a', { title: 't' })).rejects.toThrow(
        EntityNotFoundError
      );
    });

    it('必須項目を null にすると InvalidEntityDataError をスローする', async () => {
      await expect(
        repository.update('list-1', 'a', { title: null } as unknown as { title: string })
      ).rejects.toThrow(InvalidEntityDataError);
      expect(mockDocClient.send).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('存在を条件にして削除する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ $metadata: {} });

      await expect(repository.delete('list-1', 'a')).resolves.toBeUndefined();

      const command = mockDocClient.send.mock.calls[0][0] as DeleteCommand;
      expect(command).toBeInstanceOf(DeleteCommand);
      expect(command.input.Key).toEqual({ PK: 'LIST#list-1', SK: 'TODO#a' });
      expect(command.input.ConditionExpression).toBeDefined();
    });

    it('存在しない場合は EntityNotFoundError をスローする', async () => {
      mockDocClient.send.mockRejectedValueOnce(conditionFailure());
      await expect(repository.delete('list-1', 'a')).rejects.toThrow(EntityNotFoundError);
    });

    it('SDK の例外は DatabaseError に包む', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('接続失敗'));
      await expect(repository.delete('list-1', 'a')).rejects.toThrow(DatabaseError);
    });
  });

  describe('deleteByListId', () => {
    it('キーだけを射影して Query し、一括削除する', async () => {
      mockDocClient.send
        .mockResolvedValueOnce({
          Items: [
            { PK: 'LIST#list-1', SK: 'TODO#a' },
            { PK: 'LIST#list-1', SK: 'TODO#b' },
          ],
        })
        .mockResolvedValueOnce({ UnprocessedItems: {} });

      await repository.deleteByListId('list-1');

      const query = mockDocClient.send.mock.calls[0][0] as QueryCommand;
      expect(query).toBeInstanceOf(QueryCommand);
      expect(query.input.ExpressionAttributeValues).toEqual({
        ':pk': 'LIST#list-1',
        ':skPrefix': 'TODO#',
      });
      expect(query.input.ProjectionExpression).toBe('#pk, #sk');
      const batch = mockDocClient.send.mock.calls[1][0] as BatchWriteCommand;
      expect(batch).toBeInstanceOf(BatchWriteCommand);
      expect(batch.input.RequestItems?.[TABLE_NAME]).toEqual([
        { DeleteRequest: { Key: { PK: 'LIST#list-1', SK: 'TODO#a' } } },
        { DeleteRequest: { Key: { PK: 'LIST#list-1', SK: 'TODO#b' } } },
      ]);
    });

    it('複数ページにまたがる ToDo をすべて削除する', async () => {
      mockDocClient.send
        .mockResolvedValueOnce({
          Items: [{ PK: 'LIST#list-1', SK: 'TODO#a' }],
          LastEvaluatedKey: { PK: 'LIST#list-1', SK: 'TODO#a' },
        })
        .mockResolvedValueOnce({ Items: [{ PK: 'LIST#list-1', SK: 'TODO#b' }] })
        .mockResolvedValueOnce({ UnprocessedItems: {} });

      await repository.deleteByListId('list-1');

      const batch = mockDocClient.send.mock.calls[2][0] as BatchWriteCommand;
      expect(batch.input.RequestItems?.[TABLE_NAME]).toHaveLength(2);
    });

    it('ToDo がなければ削除を発行せず成功する (冪等)', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [] });

      await expect(repository.deleteByListId('list-1')).resolves.toBeUndefined();

      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });

    it('Query の例外は DatabaseError に包む', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('接続失敗'));
      await expect(repository.deleteByListId('list-1')).rejects.toThrow(DatabaseError);
    });

    it('一括削除の例外は DatabaseError に包む', async () => {
      mockDocClient.send
        .mockResolvedValueOnce({ Items: [{ PK: 'LIST#list-1', SK: 'TODO#a' }] })
        .mockRejectedValueOnce(new Error('接続失敗'));
      await expect(repository.deleteByListId('list-1')).rejects.toThrow(DatabaseError);
    });
  });
});
