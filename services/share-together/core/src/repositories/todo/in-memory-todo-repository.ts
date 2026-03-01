import type { CreateTodoItemInput, TodoItem, UpdateTodoItemInput } from '../../types/index.js';
import type { TodoRepository } from './todo-repository.interface.js';

const ERROR_MESSAGES = {
  TODO_NOT_FOUND: 'ToDoが見つかりません',
  TODO_ALREADY_EXISTS: 'ToDoは既に存在します',
} as const;

export class InMemoryTodoRepository implements TodoRepository {
  private readonly todosByListId = new Map<string, Map<string, TodoItem>>();

  public async getByListId(listId: string): Promise<TodoItem[]> {
    const todosInList = this.todosByListId.get(listId);
    if (!todosInList) {
      return [];
    }

    return Array.from(todosInList.values(), (todo) => ({ ...todo }));
  }

  public async getById(listId: string, todoId: string): Promise<TodoItem | null> {
    const todo = this.todosByListId.get(listId)?.get(todoId);
    return todo ? { ...todo } : null;
  }

  public async create(input: CreateTodoItemInput): Promise<TodoItem> {
    const todosInList = this.getOrCreateList(input.listId);

    if (todosInList.has(input.todoId)) {
      throw new Error(ERROR_MESSAGES.TODO_ALREADY_EXISTS);
    }

    const now = new Date().toISOString();
    const todo: TodoItem = {
      ...input,
      createdAt: now,
      updatedAt: now,
    };

    todosInList.set(todo.todoId, todo);
    return { ...todo };
  }

  public async update(listId: string, todoId: string, updates: UpdateTodoItemInput): Promise<TodoItem> {
    const todosInList = this.todosByListId.get(listId);
    const existingTodo = todosInList?.get(todoId);
    if (!existingTodo || !todosInList) {
      throw new Error(ERROR_MESSAGES.TODO_NOT_FOUND);
    }

    const updatedTodo: TodoItem = {
      ...existingTodo,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    todosInList.set(todoId, updatedTodo);
    return { ...updatedTodo };
  }

  public async delete(listId: string, todoId: string): Promise<void> {
    const todosInList = this.todosByListId.get(listId);
    if (!todosInList) {
      return;
    }

    todosInList.delete(todoId);
    if (todosInList.size === 0) {
      this.todosByListId.delete(listId);
    }
  }

  public async deleteByListId(listId: string): Promise<void> {
    this.todosByListId.delete(listId);
  }

  private getOrCreateList(listId: string): Map<string, TodoItem> {
    const existingTodosInList = this.todosByListId.get(listId);
    if (existingTodosInList) {
      return existingTodosInList;
    }

    const newTodosInList = new Map<string, TodoItem>();
    this.todosByListId.set(listId, newTodosInList);
    return newTodosInList;
  }
}
