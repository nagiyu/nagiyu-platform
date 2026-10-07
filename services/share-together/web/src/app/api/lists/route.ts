import { ListService } from '@nagiyu/share-together-core';
import { NextResponse } from 'next/server';
import type { PersonalListResponse, PersonalListsResponse } from '@/types';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getDynamoDBDocumentClient } from '@nagiyu/aws';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { createListRepository, createTodoRepository } from '@nagiyu/share-together-core';
import {
  createValidationErrorResponse,
  createConflictErrorResponse,
  createInternalServerErrorResponse,
} from '@/lib/api/responses';
import { isNonEmptyString, isValidationError } from '@/lib/api/validation';

const VALIDATION_ERROR_MESSAGES: Set<string> = new Set([
  ERROR_MESSAGES.USER_ID_REQUIRED,
  ERROR_MESSAGES.LIST_NAME_INVALID,
]);

function createListService(): ListService {
  const tableName = process.env.DYNAMODB_TABLE_NAME;
  if (!tableName) {
    throw new Error(ERROR_MESSAGES.DYNAMODB_TABLE_NAME_REQUIRED);
  }

  const docClient =
    process.env.USE_IN_MEMORY_DB === 'true' ? undefined : getDynamoDBDocumentClient();
  const listRepository = createListRepository(docClient, tableName);
  const todoRepository = createTodoRepository(docClient, tableName);
  return new ListService(listRepository, todoRepository);
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
    if (isValidationError(error, VALIDATION_ERROR_MESSAGES)) {
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
    if (isValidationError(error, VALIDATION_ERROR_MESSAGES) || error instanceof SyntaxError) {
      return createValidationErrorResponse();
    }
    if (error instanceof Error && error.message === ERROR_MESSAGES.PERSONAL_LIST_LIMIT_EXCEEDED) {
      return createConflictErrorResponse('PERSONAL_LIST_LIMIT_EXCEEDED', error.message);
    }

    console.error('個人リスト作成 API の実行に失敗しました', {
      userId: requestedUserId,
      error,
    });
    return createInternalServerErrorResponse();
  }
}
