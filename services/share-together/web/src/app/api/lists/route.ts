import { LIST_ERROR_MESSAGES, ListService } from '@nagiyu/share-together-core';
import { withApiErrorReporting } from '@/lib/api-error-reporting';
import { NextResponse } from 'next/server';
import { readJsonObjectBody } from '@nagiyu/nextjs';
import type { PersonalListResponse, PersonalListsResponse } from '@/types';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getDynamoDBDocumentClient } from '@nagiyu/aws';
import { InvalidInputError } from '@nagiyu/common';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { createListRepository, createTodoRepository } from '@nagiyu/share-together-core';
import { createValidationErrorResponse, createConflictErrorResponse } from '@/lib/api/responses';
import { isNonEmptyString } from '@/lib/api/validation';

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

export const GET = withApiErrorReporting(
  'Web API: 個人リスト一覧取得エラー',
  async (): Promise<NextResponse> => {
    try {
      const sessionOrUnauthorized = await getSessionOrUnauthorized();
      if ('status' in sessionOrUnauthorized) {
        return sessionOrUnauthorized;
      }

      const userId = sessionOrUnauthorized.user.id;
      if (!isNonEmptyString(userId)) {
        return createValidationErrorResponse();
      }

      const listService = createListService();
      const lists = await listService.getPersonalListsByUserId(userId);
      const response: PersonalListsResponse = {
        data: {
          lists,
        },
      };

      return NextResponse.json(response);
    } catch (error) {
      if (error instanceof InvalidInputError) {
        return createValidationErrorResponse();
      }

      throw error;
    }
  }
);

export const POST = withApiErrorReporting(
  'Web API: 個人リスト作成エラー',
  async (request: Request): Promise<NextResponse> => {
    try {
      const sessionOrUnauthorized = await getSessionOrUnauthorized();
      if ('status' in sessionOrUnauthorized) {
        return sessionOrUnauthorized;
      }

      const userId = sessionOrUnauthorized.user.id;
      if (!isNonEmptyString(userId)) {
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
      const list = await listService.createPersonalList(userId, body.name);
      const response: PersonalListResponse = {
        data: list,
      };

      return NextResponse.json(response, { status: 201 });
    } catch (error) {
      if (error instanceof InvalidInputError) {
        return createValidationErrorResponse();
      }
      if (
        error instanceof Error &&
        error.message === LIST_ERROR_MESSAGES.PERSONAL_LIST_LIMIT_EXCEEDED
      ) {
        return createConflictErrorResponse('PERSONAL_LIST_LIMIT_EXCEEDED', error.message);
      }

      throw error;
    }
  }
);
