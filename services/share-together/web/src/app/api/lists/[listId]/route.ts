import { ListService } from '@nagiyu/share-together-core';
import { withApiErrorReporting } from '@/lib/api-error-reporting';
import { NextResponse } from 'next/server';
import type { PersonalListResponse } from '@/types';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getDynamoDBDocumentClient } from '@nagiyu/aws';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { createListRepository, createTodoRepository } from '@nagiyu/share-together-core';
import { createValidationErrorResponse, createNotFoundErrorResponse } from '@/lib/api/responses';
import { isNonEmptyString, isValidationError, isNotFoundError } from '@/lib/api/validation';
import { createErrorResponse, readJsonObjectBody } from '@nagiyu/nextjs';

interface RouteContext {
  params: Promise<{ listId: string }>;
}

const NOT_FOUND_ERROR_MESSAGES: Set<string> = new Set([ERROR_MESSAGES.PERSONAL_LIST_NOT_FOUND]);
const VALIDATION_ERROR_MESSAGES: Set<string> = new Set([
  ERROR_MESSAGES.USER_ID_REQUIRED,
  ERROR_MESSAGES.LIST_ID_REQUIRED,
  ERROR_MESSAGES.LIST_NAME_INVALID,
]);

function createDefaultListNotDeletableResponse(): NextResponse {
  return createErrorResponse(
    400,
    'DEFAULT_LIST_NOT_DELETABLE',
    ERROR_MESSAGES.DEFAULT_LIST_NOT_DELETABLE
  );
}

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

function isDefaultListNotDeletableError(error: unknown): boolean {
  return error instanceof Error && error.message === ERROR_MESSAGES.DEFAULT_LIST_NOT_DELETABLE;
}

export const GET = withApiErrorReporting(
  'Web API: 個人リスト取得エラー',
  async (_request: Request, { params }: RouteContext): Promise<NextResponse> => {
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

      const listService = createListService();
      const list = await listService.getPersonalListById(userId, listId);
      const response: PersonalListResponse = {
        data: list,
      };

      return NextResponse.json(response);
    } catch (error) {
      if (isValidationError(error, VALIDATION_ERROR_MESSAGES)) {
        return createValidationErrorResponse();
      }
      if (isNotFoundError(error, NOT_FOUND_ERROR_MESSAGES)) {
        return createNotFoundErrorResponse();
      }

      throw error;
    }
  }
);

export const PUT = withApiErrorReporting(
  'Web API: 個人リスト更新エラー',
  async (request: Request, { params }: RouteContext): Promise<NextResponse> => {
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

      const bodyResult = await readJsonObjectBody(request);
      if (!bodyResult.ok) {
        return createValidationErrorResponse();
      }
      const { body } = bodyResult;
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
      if (isValidationError(error, VALIDATION_ERROR_MESSAGES)) {
        return createValidationErrorResponse();
      }
      if (isNotFoundError(error, NOT_FOUND_ERROR_MESSAGES)) {
        return createNotFoundErrorResponse();
      }

      throw error;
    }
  }
);

export const DELETE = withApiErrorReporting(
  'Web API: 個人リスト削除エラー',
  async (_request: Request, { params }: RouteContext): Promise<NextResponse> => {
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

      const listService = createListService();
      await listService.deletePersonalList(userId, listId);

      return new NextResponse(null, { status: 204 });
    } catch (error) {
      if (isValidationError(error, VALIDATION_ERROR_MESSAGES)) {
        return createValidationErrorResponse();
      }
      if (isDefaultListNotDeletableError(error)) {
        return createDefaultListNotDeletableResponse();
      }
      if (isNotFoundError(error, NOT_FOUND_ERROR_MESSAGES)) {
        return createNotFoundErrorResponse();
      }

      throw error;
    }
  }
);
