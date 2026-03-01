import { GetCommand, QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { CreateTodoItemInput, TodoItem, UpdateTodoItemInput } from '../../types/index.js';
import type { TodoRepository } from './todo-repository.interface.js';

const TODO_SK_PREFIX = 'TODO#';

const ERROR_MESSAGES = {
  INVALID_TODO_DATA: 'ToDo情報の形式が不正です',
  NOT_IMPLEMENTED: 'この操作は未実装です',
} as const;

export class DynamoDBTodoRepository implements TodoRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
  }

  public async getByListId(listId: string): Promise<TodoItem[]> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :skPrefix)',
        ExpressionAttributeNames: {
          '#pk': 'PK',
          '#sk': 'SK',
        },
        ExpressionAttributeValues: {
          ':pk': this.buildListPk(listId),
          ':skPrefix': TODO_SK_PREFIX,
        },
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return [];
    }

    return result.Items.map((item) => this.toTodoItem(item as Record<string, unknown>));
  }

  public async getById(listId: string, todoId: string): Promise<TodoItem | null> {
    const result = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: this.buildListPk(listId),
          SK: this.buildTodoSk(todoId),
        },
      })
    );

    if (!result.Item) {
      return null;
    }

    return this.toTodoItem(result.Item as Record<string, unknown>);
  }

  public async create(_input: CreateTodoItemInput): Promise<TodoItem> {
    throw new Error(ERROR_MESSAGES.NOT_IMPLEMENTED);
  }

  public async update(_listId: string, _todoId: string, _updates: UpdateTodoItemInput): Promise<TodoItem> {
    throw new Error(ERROR_MESSAGES.NOT_IMPLEMENTED);
  }

  public async delete(_listId: string, _todoId: string): Promise<void> {
    throw new Error(ERROR_MESSAGES.NOT_IMPLEMENTED);
  }

  public async deleteByListId(_listId: string): Promise<void> {
    throw new Error(ERROR_MESSAGES.NOT_IMPLEMENTED);
  }

  private buildListPk(listId: string): string {
    return `LIST#${listId}`;
  }

  private buildTodoSk(todoId: string): string {
    return `${TODO_SK_PREFIX}${todoId}`;
  }

  private toTodoItem(item: Record<string, unknown>): TodoItem {
    const todoId = item['todoId'];
    const listId = item['listId'];
    const title = item['title'];
    const isCompleted = item['isCompleted'];
    const createdBy = item['createdBy'];
    const completedBy = item['completedBy'];
    const createdAt = item['createdAt'];
    const updatedAt = item['updatedAt'];

    if (
      typeof todoId !== 'string' ||
      typeof listId !== 'string' ||
      typeof title !== 'string' ||
      typeof isCompleted !== 'boolean' ||
      typeof createdBy !== 'string' ||
      typeof createdAt !== 'string' ||
      typeof updatedAt !== 'string'
    ) {
      throw new Error(ERROR_MESSAGES.INVALID_TODO_DATA);
    }

    if (completedBy !== undefined && typeof completedBy !== 'string') {
      throw new Error(ERROR_MESSAGES.INVALID_TODO_DATA);
    }

    return {
      todoId,
      listId,
      title,
      isCompleted,
      createdBy,
      completedBy,
      createdAt,
      updatedAt,
    };
  }
}
