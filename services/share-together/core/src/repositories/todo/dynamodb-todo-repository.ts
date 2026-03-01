import {
  BatchWriteCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { CreateTodoItemInput, TodoItem, UpdateTodoItemInput } from '../../types/index.js';
import type { TodoRepository } from './todo-repository.interface.js';

const TODO_SK_PREFIX = 'TODO#';

const ERROR_MESSAGES = {
  INVALID_TODO_DATA: 'ToDo情報の形式が不正です',
  TODO_ALREADY_EXISTS: '指定されたToDoは既に存在します',
  TODO_NOT_FOUND: '指定されたToDoは存在しません',
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

  public async create(input: CreateTodoItemInput): Promise<TodoItem> {
    const now = new Date().toISOString();
    const item = {
      PK: this.buildListPk(input.listId),
      SK: this.buildTodoSk(input.todoId),
      ...input,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
          ConditionExpression: 'attribute_not_exists(#pk) AND attribute_not_exists(#sk)',
          ExpressionAttributeNames: {
            '#pk': 'PK',
            '#sk': 'SK',
          },
        })
      );
    } catch (error) {
      if (this.isConditionalCheckFailedError(error)) {
        throw new Error(ERROR_MESSAGES.TODO_ALREADY_EXISTS);
      }
      throw error;
    }

    return this.toTodoItem(item as Record<string, unknown>);
  }

  public async update(
    listId: string,
    todoId: string,
    updates: UpdateTodoItemInput
  ): Promise<TodoItem> {
    const updatedAt = new Date().toISOString();
    const setExpressions = ['#updatedAt = :updatedAt'];
    const removeExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {
      '#pk': 'PK',
      '#sk': 'SK',
      '#updatedAt': 'updatedAt',
    };
    const expressionAttributeValues: Record<string, unknown> = {
      ':updatedAt': updatedAt,
    };

    if (updates.title !== undefined) {
      setExpressions.push('#title = :title');
      expressionAttributeNames['#title'] = 'title';
      expressionAttributeValues[':title'] = updates.title;
    }
    if (updates.isCompleted !== undefined) {
      setExpressions.push('#isCompleted = :isCompleted');
      expressionAttributeNames['#isCompleted'] = 'isCompleted';
      expressionAttributeValues[':isCompleted'] = updates.isCompleted;
    }
    if ('completedBy' in updates) {
      expressionAttributeNames['#completedBy'] = 'completedBy';
      if (updates.completedBy === undefined) {
        removeExpressions.push('#completedBy');
      } else {
        setExpressions.push('#completedBy = :completedBy');
        expressionAttributeValues[':completedBy'] = updates.completedBy;
      }
    }

    let result;
    try {
      result = await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: {
            PK: this.buildListPk(listId),
            SK: this.buildTodoSk(todoId),
          },
          UpdateExpression: `SET ${setExpressions.join(', ')}${removeExpressions.length > 0 ? ` REMOVE ${removeExpressions.join(', ')}` : ''}`,
          ConditionExpression: 'attribute_exists(#pk) AND attribute_exists(#sk)',
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          ReturnValues: 'ALL_NEW',
        })
      );
    } catch (error) {
      if (this.isConditionalCheckFailedError(error)) {
        throw new Error(ERROR_MESSAGES.TODO_NOT_FOUND);
      }
      throw error;
    }

    if (!result.Attributes) {
      throw new Error(ERROR_MESSAGES.TODO_NOT_FOUND);
    }

    return this.toTodoItem(result.Attributes as Record<string, unknown>);
  }

  public async delete(listId: string, todoId: string): Promise<void> {
    try {
      await this.docClient.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: {
            PK: this.buildListPk(listId),
            SK: this.buildTodoSk(todoId),
          },
          ConditionExpression: 'attribute_exists(#pk) AND attribute_exists(#sk)',
          ExpressionAttributeNames: {
            '#pk': 'PK',
            '#sk': 'SK',
          },
        })
      );
    } catch (error) {
      if (this.isConditionalCheckFailedError(error)) {
        throw new Error(ERROR_MESSAGES.TODO_NOT_FOUND);
      }
      throw error;
    }
  }

  public async deleteByListId(listId: string): Promise<void> {
    const listPk = this.buildListPk(listId);
    const keys: Array<{ PK: string; SK: string }> = [];

    let lastEvaluatedKey: Record<string, unknown> | undefined;
    do {
      const queryResult = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :skPrefix)',
          ExpressionAttributeNames: {
            '#pk': 'PK',
            '#sk': 'SK',
          },
          ExpressionAttributeValues: {
            ':pk': listPk,
            ':skPrefix': TODO_SK_PREFIX,
          },
          ProjectionExpression: '#pk, #sk',
          ExclusiveStartKey: lastEvaluatedKey,
        })
      );

      const queriedKeys = (queryResult.Items ?? []).flatMap((item) => {
        const pk = item['PK'];
        const sk = item['SK'];
        if (typeof pk !== 'string' || typeof sk !== 'string') {
          return [];
        }
        return [{ PK: pk, SK: sk }];
      });
      keys.push(...queriedKeys);
      lastEvaluatedKey = queryResult.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastEvaluatedKey);

    if (keys.length === 0) {
      return;
    }

    for (let batchStartIndex = 0; batchStartIndex < keys.length; batchStartIndex += 25) {
      let pendingRequests = keys.slice(batchStartIndex, batchStartIndex + 25).map((key) => ({
        DeleteRequest: { Key: key },
      }));

      while (pendingRequests.length > 0) {
        const batchWriteResult = await this.docClient.send(
          new BatchWriteCommand({
            RequestItems: {
              [this.tableName]: pendingRequests,
            },
          })
        );

        pendingRequests =
          (batchWriteResult.UnprocessedItems?.[this.tableName] as
            | typeof pendingRequests
            | undefined) ?? [];
      }
    }
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

  private isConditionalCheckFailedError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      error.name === 'ConditionalCheckFailedException'
    );
  }
}
