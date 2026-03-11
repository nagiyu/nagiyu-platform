import { ListService } from '@nagiyu/share-together-core';
import { NextResponse } from 'next/server';
import type { ApiErrorResponse, PersonalListResponse } from '@/types';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getDocClient } from '@/lib/aws-clients';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { createListRepository } from '@/lib/repositories';

interface RouteContext {
  params: Promise<{ listId: string }>;
}

const NOT_FOUND_ERROR_MESSAGES: Set<string> = new Set([ERROR_MESSAGES.PERSONAL_LIST_NOT_FOUND]);
const VALIDATION_ERROR_MESSAGES: Set<string> = new Set([
  ERROR_MESSAGES.USER_ID_REQUIRED,
  ERROR_MESSAGES.LIST_ID_REQUIRED,
  ERROR_MESSAGES.LIST_NAME_INVALID,
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

function createDefaultListNotDeletableResponse(): NextResponse {
  const response: ApiErrorResponse = {
    error: {
      code: 'DEFAULT_LIST_NOT_DELETABLE',
      message: ERROR_MESSAGES.DEFAULT_LIST_NOT_DELETABLE,
    },
  };

  return NextResponse.json(response, { status: 400 });
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

function createListService(): ListService {
  const tableName = process.env.DYNAMODB_TABLE_NAME;
  if (!tableName) {
    throw new Error(ERROR_MESSAGES.DYNAMODB_TABLE_NAME_REQUIRED);
  }

  const docClient = getDocClient();
  const listRepository = createListRepository(docClient, tableName);
  return new ListService(listRepository);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidationError(error: unknown): boolean {
  return error instanceof Error && VALIDATION_ERROR_MESSAGES.has(error.message);
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && NOT_FOUND_ERROR_MESSAGES.has(error.message);
}

function isDefaultListNotDeletableError(error: unknown): boolean {
  return error instanceof Error && error.message === ERROR_MESSAGES.DEFAULT_LIST_NOT_DELETABLE;
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
    const { listId } = await params;
    if (!isNonEmptyString(userId) || !isNonEmptyString(listId)) {
      return createValidationErrorResponse();
    }

    requestedUserId = userId;
    requestedListId = listId;

    const listService = createListService();
    const list = await listService.getPersonalListById(userId, listId);
    const response: PersonalListResponse = {
      data: list,
    };

    return NextResponse.json(response);
  } catch (error) {
    if (isValidationError(error)) {
      return createValidationErrorResponse();
    }
    if (isNotFoundError(error)) {
      return createNotFoundErrorResponse();
    }

    console.error('個人リスト取得 API の実行に失敗しました', {
      userId: requestedUserId,
      listId: requestedListId,
      error,
    });
    return createInternalServerErrorResponse();
  }
}

export async function PUT(request: Request, { params }: RouteContext): Promise<NextResponse> {
  let requestedUserId: string | undefined;
  let requestedListId: string | undefined;

  try {
    const sessionOrUnauthorized = await getSessionOrUnauthorized();
    if ('status' in sessionOrUnauthorized) {
      return sessionOrUnauthorized;
    }

    const userId = sessionOrUnauthorized.user.id;
    const { listId } = await params;
    if (!isNonEmptyString(userId) || !isNonEmptyString(listId)) {
      return createValidationErrorResponse();
    }

    requestedUserId = userId;
    requestedListId = listId;

    const body = (await request.json()) as { name?: unknown };
    if (!isNonEmptyString(body.name)) {
      return createValidationErrorResponse();
    }

    const listService = createListService();
    const list = await listService.updatePersonalList(userId, listId, body.name);
    const response: PersonalListResponse = {
      data: list,
    };

    return NextResponse.json(response);
  } catch (error) {
    if (isValidationError(error) || error instanceof SyntaxError) {
      return createValidationErrorResponse();
    }
    if (isNotFoundError(error)) {
      return createNotFoundErrorResponse();
    }

    console.error('個人リスト更新 API の実行に失敗しました', {
      userId: requestedUserId,
      listId: requestedListId,
      error,
    });
    return createInternalServerErrorResponse();
  }
}

export async function DELETE(_request: Request, { params }: RouteContext): Promise<NextResponse> {
  let requestedUserId: string | undefined;
  let requestedListId: string | undefined;

  try {
    const sessionOrUnauthorized = await getSessionOrUnauthorized();
    if ('status' in sessionOrUnauthorized) {
      return sessionOrUnauthorized;
    }

    const userId = sessionOrUnauthorized.user.id;
    const { listId } = await params;
    if (!isNonEmptyString(userId) || !isNonEmptyString(listId)) {
      return createValidationErrorResponse();
    }

    requestedUserId = userId;
    requestedListId = listId;

    const listService = createListService();
    await listService.deletePersonalList(userId, listId);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (isValidationError(error)) {
      return createValidationErrorResponse();
    }
    if (isDefaultListNotDeletableError(error)) {
      return createDefaultListNotDeletableResponse();
    }
    if (isNotFoundError(error)) {
      return createNotFoundErrorResponse();
    }

    console.error('個人リスト削除 API の実行に失敗しました', {
      userId: requestedUserId,
      listId: requestedListId,
      error,
    });
    return createInternalServerErrorResponse();
  }
}
