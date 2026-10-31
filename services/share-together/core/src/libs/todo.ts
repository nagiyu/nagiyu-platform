import { InvalidInputError } from '@nagiyu/common';
import type { TodoRepository } from '../repositories/todo/todo-repository.interface.js';
import type { TodoItem, UpdateTodoItemInput } from '../types/index.js';

const ERROR_MESSAGES = {
  LIST_ID_REQUIRED: 'リストIDは必須です',
  TODO_ID_REQUIRED: 'ToDo IDは必須です',
  USER_ID_REQUIRED: 'ユーザーIDは必須です',
  TITLE_INVALID: 'ToDoのタイトルは1〜200文字で入力してください',
  UPDATE_FIELDS_REQUIRED: '更新するフィールドが指定されていません',
} as const;

export interface UpdateTodoInput {
  title?: string;
  isCompleted?: boolean;
}

export class TodoService {
  private readonly todoRepository: TodoRepository;

  constructor(todoRepository: TodoRepository) {
    this.todoRepository = todoRepository;
  }

  public async getTodosByListId(listId: string): Promise<TodoItem[]> {
    this.assertRequiredValue(listId, ERROR_MESSAGES.LIST_ID_REQUIRED);
    return this.todoRepository.getByListId(listId);
  }

  public async createTodo(listId: string, title: string, userId: string): Promise<TodoItem> {
    this.assertRequiredValue(listId, ERROR_MESSAGES.LIST_ID_REQUIRED);
    this.assertRequiredValue(userId, ERROR_MESSAGES.USER_ID_REQUIRED);
    const normalizedTitle = this.normalizeTitle(title);

    return this.todoRepository.create({
      todoId: crypto.randomUUID(),
      listId,
      title: normalizedTitle,
      isCompleted: false,
      createdBy: userId,
    });
  }

  public async updateTodo(
    listId: string,
    todoId: string,
    updates: UpdateTodoInput,
    userId: string
  ): Promise<TodoItem> {
    this.assertRequiredValue(listId, ERROR_MESSAGES.LIST_ID_REQUIRED);
    this.assertRequiredValue(todoId, ERROR_MESSAGES.TODO_ID_REQUIRED);
    this.assertRequiredValue(userId, ERROR_MESSAGES.USER_ID_REQUIRED);

    const hasTitleUpdate = updates.title !== undefined;
    const hasCompletedUpdate = updates.isCompleted !== undefined;
    if (!hasTitleUpdate && !hasCompletedUpdate) {
      throw new InvalidInputError(ERROR_MESSAGES.UPDATE_FIELDS_REQUIRED);
    }

    const repositoryUpdates: UpdateTodoItemInput = {};
    if (updates.title !== undefined) {
      repositoryUpdates.title = this.normalizeTitle(updates.title);
    }
    if (hasCompletedUpdate) {
      repositoryUpdates.isCompleted = updates.isCompleted;
      repositoryUpdates.completedBy = updates.isCompleted ? userId : null;
    }

    return this.todoRepository.update(listId, todoId, repositoryUpdates);
  }

  public async deleteTodo(listId: string, todoId: string): Promise<void> {
    this.assertRequiredValue(listId, ERROR_MESSAGES.LIST_ID_REQUIRED);
    this.assertRequiredValue(todoId, ERROR_MESSAGES.TODO_ID_REQUIRED);

    await this.todoRepository.delete(listId, todoId);
  }

  private assertRequiredValue(value: string, errorMessage: string): void {
    if (value.trim().length === 0) {
      throw new InvalidInputError(errorMessage);
    }
  }

  private normalizeTitle(title: string): string {
    const normalizedTitle = title.trim();
    if (normalizedTitle.length < 1 || normalizedTitle.length > 200) {
      throw new InvalidInputError(ERROR_MESSAGES.TITLE_INVALID);
    }
    return normalizedTitle;
  }
}
