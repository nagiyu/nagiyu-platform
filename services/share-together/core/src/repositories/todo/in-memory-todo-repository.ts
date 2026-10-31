import { InMemoryEntityStore, InMemorySingleTableStore, type EntityStore } from '@nagiyu/aws';
import type { CreateTodoItemInput, TodoItem, UpdateTodoItemInput } from '../../types/index.js';
import type { TodoRepository } from './todo-repository.interface.js';
import {
  TodoItemMapper,
  TODO_SK_PREFIX,
  buildTodoPk,
  type TodoItemKey,
} from './todo-item-mapper.js';

/**
 * InMemory Todo Repository
 *
 * 単一アイテムの CRUD は EntityStore に任せ、一覧の Query と一括削除だけを自前で持つ。
 * テスト環境で使用する。
 */
export class InMemoryTodoRepository implements TodoRepository {
  private readonly tableStore: InMemorySingleTableStore;
  private readonly mapper = new TodoItemMapper();
  private readonly store: EntityStore<TodoItem, TodoItemKey>;

  constructor(store: InMemorySingleTableStore = new InMemorySingleTableStore()) {
    this.tableStore = store;
    this.store = new InMemoryEntityStore(store, this.mapper);
  }

  public async getByListId(listId: string): Promise<TodoItem[]> {
    return this.queryByListId(listId).map((item) => this.mapper.toEntity(item));
  }

  public async getById(listId: string, todoId: string): Promise<TodoItem | null> {
    return this.store.get({ listId, todoId });
  }

  public async create(input: CreateTodoItemInput): Promise<TodoItem> {
    return this.store.create(input);
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
    for (const item of this.queryByListId(listId)) {
      this.tableStore.delete(String(item['PK']), String(item['SK']));
    }
  }

  private queryByListId(listId: string): Record<string, unknown>[] {
    const items = this.tableStore.queryAll({
      pk: buildTodoPk(listId),
      sk: { operator: 'begins_with', value: TODO_SK_PREFIX },
    });
    return items;
  }
}
