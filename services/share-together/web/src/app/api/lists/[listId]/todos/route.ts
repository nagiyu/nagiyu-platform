import { ListService, TodoService } from '@nagiyu/share-together-core';
import { withApiErrorReporting } from '@/lib/api-error-reporting';
import { NextResponse } from 'next/server';
import { readJsonObjectBody } from '@nagiyu/nextjs';
import type { TodoResponse, TodosResponse } from '@/types';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { EntityNotFoundError, getDynamoDBDocumentClient } from '@nagiyu/aws';
import { InvalidInputError } from '@nagiyu/common';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { createListRepository, createTodoRepository } from '@nagiyu/share-together-core';
import { createValidationErrorResponse, createNotFoundErrorResponse } from '@/lib/api/responses';
import { isNonEmptyString } from '@/lib/api/validation';

interface RouteContext {
  params: Promise<{ listId: string }>;
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
    listService: new ListService(listRepository, todoRepository),
    todoService: new TodoService(todoRepository),
  };
}

export const GET = withApiErrorReporting(
  'Web API: ToDo 一覧取得エラー',
  async (_request: Request, { params }: RouteContext): Promise<NextResponse> => {
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
      if (error instanceof InvalidInputError) {
        return createValidationErrorResponse();
      }

      if (error instanceof EntityNotFoundError) {
        return createNotFoundErrorResponse();
      }

      throw error;
    }
  }
);

export const POST = withApiErrorReporting(
  'Web API: ToDo 作成エラー',
  async (request: Request, { params }: RouteContext): Promise<NextResponse> => {
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

      const bodyResult = await readJsonObjectBody(request);
      if (!bodyResult.ok) {
        return createValidationErrorResponse();
      }
      const { body } = bodyResult;
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
      if (error instanceof InvalidInputError) {
        return createValidationErrorResponse();
      }

      if (error instanceof EntityNotFoundError) {
        return createNotFoundErrorResponse();
      }

      throw error;
    }
  }
);
