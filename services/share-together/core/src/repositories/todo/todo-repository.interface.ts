import type { TodoItem, CreateTodoItemInput, UpdateTodoItemInput } from '../../types/index.js';

export interface TodoRepository {
  getByListId(listId: string): Promise<TodoItem[]>;
  getById(listId: string, todoId: string): Promise<TodoItem | null>;
  create(input: CreateTodoItemInput): Promise<TodoItem>;
  update(listId: string, todoId: string, updates: UpdateTodoItemInput): Promise<TodoItem>;
  delete(listId: string, todoId: string): Promise<void>;
  deleteByListId(listId: string): Promise<void>;
}
