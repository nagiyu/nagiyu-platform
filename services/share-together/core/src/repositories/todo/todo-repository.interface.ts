import type { TodoItem, CreateTodoItemInput, UpdateTodoItemInput } from '../../types/index.js';

export interface TodoRepository {
  /** 作成順ではなく、ToDo ID の昇順で返す (DynamoDB のソートキー順) */
  getByListId(listId: string): Promise<TodoItem[]>;
  getById(listId: string, todoId: string): Promise<TodoItem | null>;
  /** @throws EntityAlreadyExistsError 同じ ToDo ID が既に存在するとき */
  create(input: CreateTodoItemInput): Promise<TodoItem>;
  /**
   * completedBy に null を渡すと完了者を削除する。undefined は変更なし。
   *
   * @throws EntityNotFoundError ToDo が存在しないとき
   */
  update(listId: string, todoId: string, updates: UpdateTodoItemInput): Promise<TodoItem>;
  /** @throws EntityNotFoundError ToDo が存在しないとき */
  delete(listId: string, todoId: string): Promise<void>;
  /** リスト内の ToDo をすべて削除する。1 件もなくても成功する */
  deleteByListId(listId: string): Promise<void>;
}
