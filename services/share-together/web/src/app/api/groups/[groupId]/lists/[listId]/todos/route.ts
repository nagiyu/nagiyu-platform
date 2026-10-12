import { type ListRepository, type TodoRepository } from '@nagiyu/share-together-core';
import { withApiErrorReporting } from '@/lib/api-error-reporting';
import { NextResponse } from 'next/server';
import { readJsonObjectBody } from '@nagiyu/nextjs';
import type { TodoResponse, TodosResponse } from '@/types';
import { getAuthorizedGroupContext } from '@/lib/api/authorization';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { createListRepository, createTodoRepository } from '@nagiyu/share-together-core';
import { createValidationErrorResponse, createNotFoundErrorResponse } from '@/lib/api/responses';

type RouteParams = {
  params: Promise<{ groupId: string; listId: string }>;
};

async function getAuthorizedContext(params: RouteParams['params']): Promise<
  | {
      groupId: string;
      listId: string;
      userId: string;
      listRepository: ListRepository;
      todoRepository: TodoRepository;
    }
  | NextResponse
> {
  const contextOrResponse = await getAuthorizedGroupContext(params);
  if ('status' in contextOrResponse) {
    return contextOrResponse;
  }

  const { groupId, listId, userId, docClient, tableName } = contextOrResponse;
  return {
    groupId,
    listId,
    userId,
    listRepository: createListRepository(docClient, tableName),
    todoRepository: createTodoRepository(docClient, tableName),
  };
}

export const GET = withApiErrorReporting(
  'Web API: グループ共有ToDo一覧取得エラー',
  async (_request: Request, { params }: RouteParams): Promise<NextResponse> => {
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

    const todos = await authorizedContextOrResponse.todoRepository.getByListId(
      authorizedContextOrResponse.listId
    );
    const response: TodosResponse = { data: { todos } };

    return NextResponse.json(response);
  }
);

export const POST = withApiErrorReporting(
  'Web API: グループ共有ToDo作成エラー',
  async (request: Request, { params }: RouteParams): Promise<NextResponse> => {
    const authorizedContextOrResponse = await getAuthorizedContext(params);
    if ('status' in authorizedContextOrResponse) {
      return authorizedContextOrResponse;
    }

    const bodyResult = await readJsonObjectBody(request);
    if (!bodyResult.ok) {
      return createValidationErrorResponse();
    }
    const { body } = bodyResult;
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (title.length < 1 || title.length > 200) {
      return createValidationErrorResponse(ERROR_MESSAGES.TODO_TITLE_INVALID);
    }

    const existingList = await authorizedContextOrResponse.listRepository.getGroupListById(
      authorizedContextOrResponse.groupId,
      authorizedContextOrResponse.listId
    );
    if (!existingList) {
      return createNotFoundErrorResponse();
    }

    const todo = await authorizedContextOrResponse.todoRepository.create({
      todoId: crypto.randomUUID(),
      listId: authorizedContextOrResponse.listId,
      title,
      isCompleted: false,
      createdBy: authorizedContextOrResponse.userId,
    });
    const response: TodoResponse = { data: todo };

    return NextResponse.json(response, { status: 201 });
  }
);
