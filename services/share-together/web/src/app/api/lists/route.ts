import { ListService } from '@nagiyu/share-together-core';
import { NextResponse } from 'next/server';
import type { ApiErrorResponse, PersonalListResponse, PersonalListsResponse } from '@/types';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getAwsClients } from '@/lib/aws-clients';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { createListRepository } from '@/lib/repositories';

const VALIDATION_ERROR_MESSAGES: Set<string> = new Set([
  ERROR_MESSAGES.USER_ID_REQUIRED,
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

function createInternalServerErrorResponse(): NextResponse {
  const response: ApiErrorResponse = {
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
    },
  };

  return NextResponse.json(response, { status: 500 });
}

function createConflictResponse(code: string, message: string): NextResponse {
  const response: ApiErrorResponse = {
    error: {
      code,
      message,
    },
  };

  return NextResponse.json(response, { status: 409 });
}

function isValidationError(error: unknown): boolean {
  return error instanceof Error && VALIDATION_ERROR_MESSAGES.has(error.message);
}

function createListService(): ListService {
  const tableName = process.env.DYNAMODB_TABLE_NAME;
  if (!tableName) {
    throw new Error(ERROR_MESSAGES.DYNAMODB_TABLE_NAME_REQUIRED);
  }

  const { docClient } = getAwsClients();
  const listRepository = createListRepository(docClient, tableName);
  return new ListService(listRepository);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export async function GET(): Promise<NextResponse> {
  let requestedUserId: string | undefined;

  try {
    const sessionOrUnauthorized = await getSessionOrUnauthorized();
    if ('status' in sessionOrUnauthorized) {
      return sessionOrUnauthorized;
    }

    const userId = sessionOrUnauthorized.user.id;
    if (!isNonEmptyString(userId)) {
      return createValidationErrorResponse();
    }

    requestedUserId = userId;

    const listService = createListService();
    const lists = await listService.getPersonalListsByUserId(userId);
    const response: PersonalListsResponse = {
      data: {
        lists,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    if (isValidationError(error)) {
      return createValidationErrorResponse();
    }

    console.error('個人リスト一覧取得 API の実行に失敗しました', {
      userId: requestedUserId,
      error,
    });
    return createInternalServerErrorResponse();
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  let requestedUserId: string | undefined;

  try {
    const sessionOrUnauthorized = await getSessionOrUnauthorized();
    if ('status' in sessionOrUnauthorized) {
      return sessionOrUnauthorized;
    }

    const userId = sessionOrUnauthorized.user.id;
    if (!isNonEmptyString(userId)) {
      return createValidationErrorResponse();
    }

    requestedUserId = userId;

    const body = (await request.json()) as { name?: unknown };
    if (!isNonEmptyString(body.name)) {
      return createValidationErrorResponse();
    }

    const listService = createListService();
    const list = await listService.createPersonalList(userId, body.name);
    const response: PersonalListResponse = {
      data: list,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    if (isValidationError(error) || error instanceof SyntaxError) {
      return createValidationErrorResponse();
    }
    if (error instanceof Error && error.message === ERROR_MESSAGES.PERSONAL_LIST_LIMIT_EXCEEDED) {
      return createConflictResponse('PERSONAL_LIST_LIMIT_EXCEEDED', error.message);
    }

    console.error('個人リスト作成 API の実行に失敗しました', {
      userId: requestedUserId,
      error,
    });
    return createInternalServerErrorResponse();
  }
}
