import { type ListRepository, TodoService } from '@nagiyu/share-together-core';
import { NextResponse } from 'next/server';
import type { TodoResponse } from '@/types';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getDynamoDBDocumentClient } from '@nagiyu/aws';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { createListRepository, createTodoRepository } from '@nagiyu/share-together-core';
import {
  createValidationErrorResponse,
  createNotFoundErrorResponse,
  createForbiddenErrorResponse,
  createInternalServerErrorResponse,
} from '@/lib/api/responses';
import { isNonEmptyString, isValidationError, isNotFoundError } from '@/lib/api/validation';

const VALIDATION_ERROR_MESSAGES: Set<string> = new Set([
  ERROR_MESSAGES.USER_ID_REQUIRED,
  ERROR_MESSAGES.LIST_ID_REQUIRED,
  ERROR_MESSAGES.TODO_ID_REQUIRED,
  ERROR_MESSAGES.TODO_TITLE_INVALID,
  ERROR_MESSAGES.UPDATE_FIELDS_REQUIRED,
]);

const NOT_FOUND_ERROR_MESSAGES: Set<string> = new Set([ERROR_MESSAGES.TODO_NOT_FOUND]);

interface TodoRouteParams {
  listId: string;
  todoId: string;
}

interface UpdateTodoRequestBody {
  title?: unknown;
  isCompleted?: unknown;
}

function createServices(): { listRepository: ListRepository; todoService: TodoService } {
  const tableName = process.env.DYNAMODB_TABLE_NAME;
  if (!tableName) {
    throw new Error(ERROR_MESSAGES.DYNAMODB_TABLE_NAME_REQUIRED);
  }

  const docClient =
    process.env.USE_IN_MEMORY_DB === 'true' ? undefined : getDynamoDBDocumentClient();
  const listRepository = createListRepository(docClient, tableName);
  const todoRepository = createTodoRepository(docClient, tableName);
  return {
    listRepository,
    todoService: new TodoService(todoRepository),
  };
}

function parseUpdateBody(
  body: UpdateTodoRequestBody
): { title?: string; isCompleted?: boolean } | null {
  const updates: { title?: string; isCompleted?: boolean } = {};

  if (body.title !== undefined) {
    if (typeof body.title !== 'string') {
      return null;
    }
    updates.title = body.title;
  }

  if (body.isCompleted !== undefined) {
    if (typeof body.isCompleted !== 'boolean') {
      return null;
    }
    updates.isCompleted = body.isCompleted;
  }

  return updates;
}

export async function PUT(
  request: Request,
  context: { params: Promise<TodoRouteParams> }
): Promise<Response> {
  let requestedUserId: string | undefined;
  let requestedListId: string | undefined;
  let requestedTodoId: string | undefined;

  try {
    const sessionOrUnauthorized = await getSessionOrUnauthorized();
    if ('status' in sessionOrUnauthorized) {
      return sessionOrUnauthorized;
    }

    const userId = sessionOrUnauthorized.user.id;
    const { listId, todoId } = await context.params;

    if (!isNonEmptyString(userId) || !isNonEmptyString(listId) || !isNonEmptyString(todoId)) {
      return createValidationErrorResponse();
    }

    requestedUserId = userId;
    requestedListId = listId;
    requestedTodoId = todoId;

    const body = (await request.json()) as UpdateTodoRequestBody;
    const updates = parseUpdateBody(body);
    if (!updates) {
      return createValidationErrorResponse();
    }

    const { listRepository, todoService } = createServices();
    const existingList = await listRepository.getPersonalListById(userId, listId);
    if (!existingList) {
      return createForbiddenErrorResponse();
    }
    const todo = await todoService.updateTodo(listId, todoId, updates, userId);
    const response: TodoResponse = {
      data: todo,
    };

    return NextResponse.json(response);
  } catch (error) {
    if (isValidationError(error, VALIDATION_ERROR_MESSAGES) || error instanceof SyntaxError) {
      return createValidationErrorResponse();
    }
    if (isNotFoundError(error, NOT_FOUND_ERROR_MESSAGES)) {
      return createNotFoundErrorResponse();
    }

    console.error('ToDo 更新 API の実行に失敗しました', {
      userId: requestedUserId,
      listId: requestedListId,
      todoId: requestedTodoId,
      error,
    });
    return createInternalServerErrorResponse();
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<TodoRouteParams> }
): Promise<Response> {
  let requestedUserId: string | undefined;
  let requestedListId: string | undefined;
  let requestedTodoId: string | undefined;

  try {
    const sessionOrUnauthorized = await getSessionOrUnauthorized();
    if ('status' in sessionOrUnauthorized) {
      return sessionOrUnauthorized;
    }

    const userId = sessionOrUnauthorized.user.id;
    const { listId, todoId } = await context.params;

    if (!isNonEmptyString(userId) || !isNonEmptyString(listId) || !isNonEmptyString(todoId)) {
      return createValidationErrorResponse();
    }

    requestedUserId = userId;
    requestedListId = listId;
    requestedTodoId = todoId;

    const { listRepository, todoService } = createServices();
    const existingList = await listRepository.getPersonalListById(userId, listId);
    if (!existingList) {
      return createForbiddenErrorResponse();
    }
    await todoService.deleteTodo(listId, todoId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (isValidationError(error, VALIDATION_ERROR_MESSAGES)) {
      return createValidationErrorResponse();
    }
    if (isNotFoundError(error, NOT_FOUND_ERROR_MESSAGES)) {
      return createNotFoundErrorResponse();
    }

    console.error('ToDo 削除 API の実行に失敗しました', {
      userId: requestedUserId,
      listId: requestedListId,
      todoId: requestedTodoId,
      error,
    });
    return createInternalServerErrorResponse();
  }
}
