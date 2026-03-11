import {
  BatchWriteCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DynamoDBTodoRepository } from '../../../../src/repositories/todo/dynamodb-todo-repository.js';

describe('DynamoDBTodoRepository', () => {
  const TABLE_NAME = 'test-share-together-main';
  let repository: DynamoDBTodoRepository;
  let mockDocClient: { send: jest.Mock };

  beforeEach(() => {
    mockDocClient = {
      send: jest.fn(),
    };

    repository = new DynamoDBTodoRepository(
      mockDocClient as unknown as DynamoDBDocumentClient,
      TABLE_NAME
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getByListId', () => {
    it('リストIDでToDo一覧を取得できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Items: [
          {
            PK: 'LIST#list-1',
            SK: 'TODO#todo-1',
            todoId: 'todo-1',
            listId: 'list-1',
            title: '買い物に行く',
            isCompleted: false,
            createdBy: 'user-1',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      });

      const result = await repository.getByListId('list-1');
      const command = mockDocClient.send.mock.calls[0]?.[0] as QueryCommand;

      expect(result).toEqual([
        {
          todoId: 'todo-1',
          listId: 'list-1',
          title: '買い物に行く',
          isCompleted: false,
          createdBy: 'user-1',
          completedBy: undefined,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
      expect(command.input).toEqual({
        TableName: TABLE_NAME,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :skPrefix)',
        ExpressionAttributeNames: {
          '#pk': 'PK',
          '#sk': 'SK',
        },
        ExpressionAttributeValues: {
          ':pk': 'LIST#list-1',
          ':skPrefix': 'TODO#',
        },
      });
    });

    it('ToDoが存在しない場合は空配列を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [] });

      const result = await repository.getByListId('list-404');

      expect(result).toEqual([]);
    });
  });

  describe('getById', () => {
    it('ToDoをIDで取得できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Item: {
          PK: 'LIST#list-1',
          SK: 'TODO#todo-1',
          todoId: 'todo-1',
          listId: 'list-1',
          title: '牛乳を買う',
          isCompleted: true,
          createdBy: 'user-1',
          completedBy: 'user-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      });

      const result = await repository.getById('list-1', 'todo-1');
      const command = mockDocClient.send.mock.calls[0]?.[0] as GetCommand;

      expect(result).toEqual({
        todoId: 'todo-1',
        listId: 'list-1',
        title: '牛乳を買う',
        isCompleted: true,
        createdBy: 'user-1',
        completedBy: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      });
      expect(command.input).toEqual({
        TableName: TABLE_NAME,
        Key: {
          PK: 'LIST#list-1',
          SK: 'TODO#todo-1',
        },
      });
    });

    it('ToDoが存在しない場合はnullを返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: undefined });

      const result = await repository.getById('list-1', 'todo-404');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('ToDoを作成できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({});

      const result = await repository.create({
        todoId: 'todo-1',
        listId: 'list-1',
        title: 'title',
        isCompleted: false,
        createdBy: 'user-1',
      });
      const command = mockDocClient.send.mock.calls[0]?.[0] as PutCommand;

      expect(result).toMatchObject({
        todoId: 'todo-1',
        listId: 'list-1',
        title: 'title',
        isCompleted: false,
        createdBy: 'user-1',
      });
      expect(result.createdAt).toEqual(expect.any(String));
      expect(result.updatedAt).toEqual(expect.any(String));
      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        ConditionExpression: 'attribute_not_exists(#pk) AND attribute_not_exists(#sk)',
        ExpressionAttributeNames: {
          '#pk': 'PK',
          '#sk': 'SK',
        },
        Item: {
          PK: 'LIST#list-1',
          SK: 'TODO#todo-1',
          todoId: 'todo-1',
          listId: 'list-1',
          title: 'title',
          isCompleted: false,
          createdBy: 'user-1',
        },
      });
      expect(command.input.Item?.createdAt).toEqual(expect.any(String));
      expect(command.input.Item?.updatedAt).toEqual(expect.any(String));
    });

    it('同一キーのToDo作成時は日本語エラーを投げる', async () => {
      mockDocClient.send.mockRejectedValueOnce({
        name: 'ConditionalCheckFailedException',
      });

      await expect(
        repository.create({
          todoId: 'todo-1',
          listId: 'list-1',
          title: 'title',
          isCompleted: false,
          createdBy: 'user-1',
        })
      ).rejects.toThrow('指定されたToDoは既に存在します');
    });
  });

  describe('update', () => {
    it('ToDoを更新できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: {
          PK: 'LIST#list-1',
          SK: 'TODO#todo-1',
          todoId: 'todo-1',
          listId: 'list-1',
          title: 'updated',
          isCompleted: true,
          createdBy: 'user-1',
          completedBy: 'user-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      });

      const result = await repository.update('list-1', 'todo-1', {
        title: 'updated',
        isCompleted: true,
        completedBy: 'user-1',
      });
      const command = mockDocClient.send.mock.calls[0]?.[0] as UpdateCommand;

      expect(result).toEqual({
        todoId: 'todo-1',
        listId: 'list-1',
        title: 'updated',
        isCompleted: true,
        createdBy: 'user-1',
        completedBy: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      });
      expect(command.input).toMatchObject({
        TableName: TABLE_NAME,
        Key: {
          PK: 'LIST#list-1',
          SK: 'TODO#todo-1',
        },
        ConditionExpression: 'attribute_exists(#pk) AND attribute_exists(#sk)',
        ReturnValues: 'ALL_NEW',
      });
      expect(command.input.UpdateExpression).toContain('#title = :title');
      expect(command.input.UpdateExpression).toContain('#isCompleted = :isCompleted');
      expect(command.input.UpdateExpression).toContain('#completedBy = :completedBy');
      expect(command.input.ExpressionAttributeValues?.[':title']).toBe('updated');
      expect(command.input.ExpressionAttributeValues?.[':isCompleted']).toBe(true);
      expect(command.input.ExpressionAttributeValues?.[':completedBy']).toBe('user-1');
      expect(command.input.ExpressionAttributeValues?.[':updatedAt']).toEqual(expect.any(String));
    });

    it('completedByを削除して更新できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: {
          PK: 'LIST#list-1',
          SK: 'TODO#todo-1',
          todoId: 'todo-1',
          listId: 'list-1',
          title: 'updated',
          isCompleted: false,
          createdBy: 'user-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      });

      await repository.update('list-1', 'todo-1', {
        isCompleted: false,
        completedBy: undefined,
      });
      const command = mockDocClient.send.mock.calls[0]?.[0] as UpdateCommand;

      expect(command.input.UpdateExpression).toContain('REMOVE #completedBy');
      expect(command.input.ExpressionAttributeValues?.[':isCompleted']).toBe(false);
      expect(command.input.ExpressionAttributeValues?.[':updatedAt']).toEqual(expect.any(String));
    });

    it('存在しないToDo更新時は日本語エラーを投げる', async () => {
      mockDocClient.send.mockRejectedValueOnce({
        name: 'ConditionalCheckFailedException',
      });

      await expect(repository.update('list-1', 'todo-404', { title: 'updated' })).rejects.toThrow(
        '指定されたToDoは存在しません'
      );
    });
  });

  describe('delete', () => {
    it('ToDoを削除できる', async () => {
      mockDocClient.send.mockResolvedValueOnce({});

      await repository.delete('list-1', 'todo-1');
      const command = mockDocClient.send.mock.calls[0]?.[0] as DeleteCommand;

      expect(command.input).toEqual({
        TableName: TABLE_NAME,
        Key: {
          PK: 'LIST#list-1',
          SK: 'TODO#todo-1',
        },
        ConditionExpression: 'attribute_exists(#pk) AND attribute_exists(#sk)',
        ExpressionAttributeNames: {
          '#pk': 'PK',
          '#sk': 'SK',
        },
      });
    });

    it('存在しないToDo削除時は日本語エラーを投げる', async () => {
      mockDocClient.send.mockRejectedValueOnce({
        name: 'ConditionalCheckFailedException',
      });

      await expect(repository.delete('list-1', 'todo-404')).rejects.toThrow(
        '指定されたToDoは存在しません'
      );
    });
  });

  describe('deleteByListId', () => {
    it('リスト内のToDoを一括削除できる', async () => {
      mockDocClient.send
        .mockResolvedValueOnce({
          Items: [
            { PK: 'LIST#list-1', SK: 'TODO#todo-1' },
            { PK: 'LIST#list-1', SK: 'TODO#todo-2' },
          ],
        })
        .mockResolvedValueOnce({});

      await repository.deleteByListId('list-1');

      const queryCommand = mockDocClient.send.mock.calls[0]?.[0] as QueryCommand;
      const batchWriteCommand = mockDocClient.send.mock.calls[1]?.[0] as BatchWriteCommand;

      expect(queryCommand.input).toMatchObject({
        TableName: TABLE_NAME,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :skPrefix)',
        ExpressionAttributeNames: {
          '#pk': 'PK',
          '#sk': 'SK',
        },
        ExpressionAttributeValues: {
          ':pk': 'LIST#list-1',
          ':skPrefix': 'TODO#',
        },
        ProjectionExpression: '#pk, #sk',
      });
      expect(batchWriteCommand.input).toEqual({
        RequestItems: {
          [TABLE_NAME]: [
            {
              DeleteRequest: {
                Key: { PK: 'LIST#list-1', SK: 'TODO#todo-1' },
              },
            },
            {
              DeleteRequest: {
                Key: { PK: 'LIST#list-1', SK: 'TODO#todo-2' },
              },
            },
          ],
        },
      });
    });

    it('ToDoが存在しない場合は何もしない', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Items: [] });

      await repository.deleteByListId('list-1');

      expect(mockDocClient.send).toHaveBeenCalledTimes(1);
    });
  });
});
