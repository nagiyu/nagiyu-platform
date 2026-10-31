import { type ListRepository, TodoService } from '@nagiyu/share-together-core';
import { withApiErrorReporting } from '@/lib/api-error-reporting';
import { NextResponse } from 'next/server';
import { readJsonObjectBody } from '@nagiyu/nextjs';
import type { TodoResponse } from '@/types';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { EntityNotFoundError, getDynamoDBDocumentClient } from '@nagiyu/aws';
import { InvalidInputError } from '@nagiyu/common';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { createListRepository, createTodoRepository } from '@nagiyu/share-together-core';
import {
  createValidationErrorResponse,
  createNotFoundErrorResponse,
  createForbiddenErrorResponse,
} from '@/lib/api/responses';
import { isNonEmptyString } from '@/lib/api/validation';

interface TodoRouteParams {
  listId: string;
  todoId: string;
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
  body: Record<string, unknown>
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

export const PUT = withApiErrorReporting(
  'Web API: ToDo 更新エラー',
  async (request: Request, context: { params: Promise<TodoRouteParams> }): Promise<Response> => {
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

      const bodyResult = await readJsonObjectBody(request);
      if (!bodyResult.ok) {
        return createValidationErrorResponse();
      }
      const { body } = bodyResult;
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

export const DELETE = withApiErrorReporting(
  'Web API: ToDo 削除エラー',
  async (_request: Request, context: { params: Promise<TodoRouteParams> }): Promise<Response> => {
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

      const { listRepository, todoService } = createServices();
      const existingList = await listRepository.getPersonalListById(userId, listId);
      if (!existingList) {
        return createForbiddenErrorResponse();
      }
      await todoService.deleteTodo(listId, todoId);
      return new NextResponse(null, { status: 204 });
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
