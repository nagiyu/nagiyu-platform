import { GetCommand, QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
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

  describe('未実装メソッド', () => {
    it('create は未実装エラーを投げる', async () => {
      await expect(
        repository.create({
          todoId: 'todo-1',
          listId: 'list-1',
          title: 'title',
          isCompleted: false,
          createdBy: 'user-1',
          completedBy: undefined,
        })
      ).rejects.toThrow('この操作は未実装です');
    });

    it('update は未実装エラーを投げる', async () => {
      await expect(repository.update('list-1', 'todo-1', { title: 'updated' })).rejects.toThrow(
        'この操作は未実装です'
      );
    });

    it('delete は未実装エラーを投げる', async () => {
      await expect(repository.delete('list-1', 'todo-1')).rejects.toThrow('この操作は未実装です');
    });

    it('deleteByListId は未実装エラーを投げる', async () => {
      await expect(repository.deleteByListId('list-1')).rejects.toThrow('この操作は未実装です');
    });
  });
});
