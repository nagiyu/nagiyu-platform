import { type ListRepository, type TodoRepository } from '@nagiyu/share-together-core';
import { NextResponse } from 'next/server';
import type { TodoResponse, TodosResponse } from '@/types';
import { getAuthorizedGroupContext } from '@/lib/api/authorization';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { createListRepository, createTodoRepository } from '@nagiyu/share-together-core';
import {
  createValidationErrorResponse,
  createNotFoundErrorResponse,
  createInternalServerErrorResponse,
} from '@/lib/api/responses';

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

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  let requestedGroupId: string | undefined;
  let requestedListId: string | undefined;
  try {
    const authorizedContextOrResponse = await getAuthorizedContext(params);
    if ('status' in authorizedContextOrResponse) {
      return authorizedContextOrResponse;
    }

    requestedGroupId = authorizedContextOrResponse.groupId;
    requestedListId = authorizedContextOrResponse.listId;

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
  } catch (error) {
    console.error('グループ共有ToDo一覧取得 API の実行に失敗しました', {
      groupId: requestedGroupId,
      listId: requestedListId,
      error,
    });
    return createInternalServerErrorResponse();
  }
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  let requestedGroupId: string | undefined;
  let requestedListId: string | undefined;
  let requestedUserId: string | undefined;
  try {
    const authorizedContextOrResponse = await getAuthorizedContext(params);
    if ('status' in authorizedContextOrResponse) {
      return authorizedContextOrResponse;
    }

    requestedGroupId = authorizedContextOrResponse.groupId;
    requestedListId = authorizedContextOrResponse.listId;
    requestedUserId = authorizedContextOrResponse.userId;

    const body = (await request.json()) as { title?: unknown };
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
  } catch (error) {
    console.error('グループ共有ToDo作成 API の実行に失敗しました', {
      groupId: requestedGroupId,
      listId: requestedListId,
      userId: requestedUserId,
      error,
    });
    return createInternalServerErrorResponse();
  }
}
