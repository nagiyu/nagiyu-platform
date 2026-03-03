import { DynamoDBTodoRepository, TodoService } from '@nagiyu/share-together-core';
import { NextResponse } from 'next/server';
import type { ApiErrorResponse, TodoResponse } from '@/types';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getAwsClients } from '@/lib/aws-clients';
import { ERROR_MESSAGES } from '@/lib/constants/errors';

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

function createValidationErrorResponse(): NextResponse {
  const response: ApiErrorResponse = {
    error: {
      code: 'VALIDATION_ERROR',
      message: ERROR_MESSAGES.VALIDATION_ERROR,
    },
  };

  return NextResponse.json(response, { status: 400 });
}

function createNotFoundErrorResponse(): NextResponse {
  const response: ApiErrorResponse = {
    error: {
      code: 'NOT_FOUND',
      message: ERROR_MESSAGES.NOT_FOUND,
    },
  };

  return NextResponse.json(response, { status: 404 });
}

function createInternalServerErrorResponse(): NextResponse {
  const response: ApiErrorResponse = {
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
    },
  };

  return NextResponse.json(response, { status: 500 });
}

function createTodoService(): TodoService {
  const tableName = process.env.DYNAMODB_TABLE_NAME;
  if (!tableName) {
    throw new Error(ERROR_MESSAGES.DYNAMODB_TABLE_NAME_REQUIRED);
  }

  const { docClient } = getAwsClients();
  const todoRepository = new DynamoDBTodoRepository(docClient, tableName);
  return new TodoService(todoRepository);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
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

function isValidationError(error: unknown): boolean {
  return error instanceof Error && VALIDATION_ERROR_MESSAGES.has(error.message);
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && NOT_FOUND_ERROR_MESSAGES.has(error.message);
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

    const todoService = createTodoService();
    const todo = await todoService.updateTodo(listId, todoId, updates, userId);
    const response: TodoResponse = {
      data: todo,
    };

    return NextResponse.json(response);
  } catch (error) {
    if (isValidationError(error) || error instanceof SyntaxError) {
      return createValidationErrorResponse();
    }
    if (isNotFoundError(error)) {
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

    const todoService = createTodoService();
    await todoService.deleteTodo(listId, todoId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (isValidationError(error)) {
      return createValidationErrorResponse();
    }
    if (isNotFoundError(error)) {
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
