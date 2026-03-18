import { ListService, TodoService } from '@nagiyu/share-together-core';
import { NextResponse } from 'next/server';
import type { ApiErrorResponse, TodoResponse, TodosResponse } from '@/types';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getDynamoDBDocumentClient } from '@nagiyu/aws';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { createListRepository, createTodoRepository } from '@nagiyu/share-together-core';

interface RouteContext {
  params: Promise<{ listId: string }>;
}

export const SERVICE_ERROR_MESSAGES = {
  LIST_ID_REQUIRED: 'リストIDは必須です',
  PERSONAL_LIST_NOT_FOUND: '個人リストが見つかりません',
  TITLE_INVALID: 'ToDoのタイトルは1〜200文字で入力してください',
} as const;

const VALIDATION_ERROR_MESSAGES: Set<string> = new Set([
  ERROR_MESSAGES.USER_ID_REQUIRED,
  SERVICE_ERROR_MESSAGES.LIST_ID_REQUIRED,
  SERVICE_ERROR_MESSAGES.TITLE_INVALID,
]);

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

function isValidationError(error: unknown): boolean {
  return error instanceof Error && VALIDATION_ERROR_MESSAGES.has(error.message);
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message === SERVICE_ERROR_MESSAGES.PERSONAL_LIST_NOT_FOUND;
}

function createServices(): { listService: ListService; todoService: TodoService } {
  const tableName = process.env.DYNAMODB_TABLE_NAME;
  if (!tableName) {
    throw new Error(ERROR_MESSAGES.DYNAMODB_TABLE_NAME_REQUIRED);
  }

  const docClient =
    process.env.USE_IN_MEMORY_DB === 'true' ? undefined : getDynamoDBDocumentClient();
  const listRepository = createListRepository(docClient, tableName);
  const todoRepository = createTodoRepository(docClient, tableName);

  return {
    listService: new ListService(listRepository),
    todoService: new TodoService(todoRepository),
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export async function GET(_request: Request, { params }: RouteContext): Promise<NextResponse> {
  let requestedUserId: string | undefined;
  let requestedListId: string | undefined;

  try {
    const sessionOrUnauthorized = await getSessionOrUnauthorized();
    if ('status' in sessionOrUnauthorized) {
      return sessionOrUnauthorized;
    }

    const userId = sessionOrUnauthorized.user.id;
    if (!isNonEmptyString(userId)) {
      return createValidationErrorResponse();
    }

    const { listId } = await params;
    if (!isNonEmptyString(listId)) {
      return createValidationErrorResponse();
    }

    requestedUserId = userId;
    requestedListId = listId;

    const { listService, todoService } = createServices();
    await listService.getPersonalListById(userId, listId);
    const todos = await todoService.getTodosByListId(listId);

    const response: TodosResponse = {
      data: {
        todos,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    if (isValidationError(error)) {
      return createValidationErrorResponse();
    }

    if (isNotFoundError(error)) {
      return createNotFoundErrorResponse();
    }

    console.error('ToDo 一覧取得 API の実行に失敗しました', {
      userId: requestedUserId,
      listId: requestedListId,
      error,
    });
    return createInternalServerErrorResponse();
  }
}

export async function POST(request: Request, { params }: RouteContext): Promise<NextResponse> {
  let requestedUserId: string | undefined;
  let requestedListId: string | undefined;

  try {
    const sessionOrUnauthorized = await getSessionOrUnauthorized();
    if ('status' in sessionOrUnauthorized) {
      return sessionOrUnauthorized;
    }

    const userId = sessionOrUnauthorized.user.id;
    if (!isNonEmptyString(userId)) {
      return createValidationErrorResponse();
    }

    const { listId } = await params;
    if (!isNonEmptyString(listId)) {
      return createValidationErrorResponse();
    }

    requestedUserId = userId;
    requestedListId = listId;

    const body = (await request.json()) as { title?: unknown };
    if (!isNonEmptyString(body.title)) {
      return createValidationErrorResponse();
    }

    const { listService, todoService } = createServices();
    await listService.getPersonalListById(userId, listId);
    const todo = await todoService.createTodo(listId, body.title, userId);

    const response: TodoResponse = {
      data: todo,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    if (isValidationError(error) || error instanceof SyntaxError) {
      return createValidationErrorResponse();
    }

    if (isNotFoundError(error)) {
      return createNotFoundErrorResponse();
    }

    console.error('ToDo 作成 API の実行に失敗しました', {
      userId: requestedUserId,
      listId: requestedListId,
      error,
    });
    return createInternalServerErrorResponse();
  }
}
