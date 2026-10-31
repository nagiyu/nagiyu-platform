import { type ListRepository, TodoService } from '@nagiyu/share-together-core';
import { withApiErrorReporting } from '@/lib/api-error-reporting';
import { NextResponse } from 'next/server';
import { EntityNotFoundError } from '@nagiyu/aws';
import { InvalidInputError } from '@nagiyu/common';
import { readJsonObjectBody } from '@nagiyu/nextjs';
import type { TodoResponse } from '@/types';
import { getAuthorizedGroupContext } from '@/lib/api/authorization';
import { createListRepository, createTodoRepository } from '@nagiyu/share-together-core';
import { createValidationErrorResponse, createNotFoundErrorResponse } from '@/lib/api/responses';

interface TodoRouteParams {
  groupId: string;
  listId: string;
  todoId: string;
}

interface RouteParams {
  params: Promise<TodoRouteParams>;
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

async function getAuthorizedContext(params: RouteParams['params']): Promise<
  | {
      groupId: string;
      listId: string;
      todoId: string;
      userId: string;
      listRepository: ListRepository;
      todoService: TodoService;
    }
  | NextResponse
> {
  const contextOrResponse = await getAuthorizedGroupContext(params);
  if ('status' in contextOrResponse) {
    return contextOrResponse;
  }

  const { groupId, listId, todoId, userId, docClient, tableName } = contextOrResponse;
  return {
    groupId,
    listId,
    todoId,
    userId,
    listRepository: createListRepository(docClient, tableName),
    todoService: new TodoService(createTodoRepository(docClient, tableName)),
  };
}

export const PUT = withApiErrorReporting(
  'Web API: グループ共有ToDo更新エラー',
  async (request: Request, { params }: RouteParams): Promise<NextResponse> => {
    try {
      const authorizedContextOrResponse = await getAuthorizedContext(params);
      if ('status' in authorizedContextOrResponse) {
        return authorizedContextOrResponse;
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

      const existingList = await authorizedContextOrResponse.listRepository.getGroupListById(
        authorizedContextOrResponse.groupId,
        authorizedContextOrResponse.listId
      );
      if (!existingList) {
        return createNotFoundErrorResponse();
      }

      const todo = await authorizedContextOrResponse.todoService.updateTodo(
        authorizedContextOrResponse.listId,
        authorizedContextOrResponse.todoId,
        updates,
        authorizedContextOrResponse.userId
      );

      const response: TodoResponse = { data: todo };
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
  'Web API: グループ共有ToDo削除エラー',
  async (_request: Request, { params }: RouteParams): Promise<NextResponse> => {
    try {
      const authorizedContextOrResponse = await getAuthorizedContext(params);
      if ('status' in authorizedContextOrResponse) {
        return authorizedContextOrResponse;
      }

      const existingList = await authorizedContextOrResponse.listRepository.getGroupListById(
        authorizedContextOrResponse.groupId,
        authorizedContextOrResponse.listId
      );
      if (!existingList) {
        return createNotFoundErrorResponse();
      }

      await authorizedContextOrResponse.todoService.deleteTodo(
        authorizedContextOrResponse.listId,
        authorizedContextOrResponse.todoId
      );
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
