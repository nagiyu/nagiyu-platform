import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { batchWriteAll, DynamoDBEntityStore, queryAllItems, type EntityStore } from '@nagiyu/aws';
import type { CreateTodoItemInput, TodoItem, UpdateTodoItemInput } from '../../types/index.js';
import type { TodoRepository } from './todo-repository.interface.js';
import {
  TodoItemMapper,
  TODO_SK_PREFIX,
  buildTodoPk,
  type TodoItemKey,
} from './todo-item-mapper.js';
import { withDatabaseError } from '../with-database-error.js';

/**
 * DynamoDB Todo Repository
 *
 * 単一アイテムの CRUD は EntityStore に任せ、PK + SK 接頭辞の一覧 Query と
 * リスト単位の一括削除だけを自前で持つ。
 */
export class DynamoDBTodoRepository implements TodoRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly mapper = new TodoItemMapper();
  private readonly store: EntityStore<TodoItem, TodoItemKey>;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.store = new DynamoDBEntityStore(docClient, tableName, this.mapper);
  }

  public async getByListId(listId: string): Promise<TodoItem[]> {
    const items = await withDatabaseError(() =>
      queryAllItems(this.docClient, {
        TableName: this.tableName,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :skPrefix)',
        ExpressionAttributeNames: {
          '#pk': 'PK',
          '#sk': 'SK',
        },
        ExpressionAttributeValues: {
          ':pk': buildTodoPk(listId),
          ':skPrefix': TODO_SK_PREFIX,
        },
      })
    );

    return items.map((item) => this.mapper.toEntity(item as Record<string, unknown>));
  }

  public async getById(listId: string, todoId: string): Promise<TodoItem | null> {
    return this.store.get({ listId, todoId });
  }

  public async create(input: CreateTodoItemInput): Promise<TodoItem> {
    const now = Date.now();
    // updatedAt は store が書き込み時に現在時刻で上書きする。Entity 型上は必須のため値だけ渡す。
    return this.store.create({ ...input, createdAt: now, updatedAt: now });
  }

  public async update(
    listId: string,
    todoId: string,
    updates: UpdateTodoItemInput
  ): Promise<TodoItem> {
    return this.store.update({ listId, todoId }, updates);
  }

  public async delete(listId: string, todoId: string): Promise<void> {
    await this.store.delete({ listId, todoId });
  }

  public async deleteByListId(listId: string): Promise<void> {
    const items = await withDatabaseError(() =>
      queryAllItems(this.docClient, {
        TableName: this.tableName,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :skPrefix)',
        ExpressionAttributeNames: {
          '#pk': 'PK',
          '#sk': 'SK',
        },
        ExpressionAttributeValues: {
          ':pk': buildTodoPk(listId),
          ':skPrefix': TODO_SK_PREFIX,
        },
        // 削除にはキーだけが要るため、本文を転送しない
        ProjectionExpression: '#pk, #sk',
      })
    );

    if (items.length === 0) {
      return;
    }

    await withDatabaseError(() =>
      batchWriteAll(
        this.docClient,
        this.tableName,
        items.map((item) => ({ DeleteRequest: { Key: { PK: item['PK'], SK: item['SK'] } } }))
      )
    );
  }
}
