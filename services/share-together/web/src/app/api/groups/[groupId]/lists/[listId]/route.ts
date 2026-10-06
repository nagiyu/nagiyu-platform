import { type ListRepository, type TodoRepository } from '@nagiyu/share-together-core';
import { NextResponse } from 'next/server';
import type { GroupListResponse } from '@/types';
import { getAuthorizedGroupContext } from '@/lib/api/authorization';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { createListRepository, createTodoRepository } from '@nagiyu/share-together-core';
import {
  createValidationErrorResponse,
  createNotFoundErrorResponse,
  createInternalServerErrorResponse,
} from '@/lib/api/responses';

interface RouteParams {
  params: Promise<{ groupId: string; listId: string }>;
}

async function getAuthorizedContext(params: RouteParams['params']): Promise<
  | {
      groupId: string;
      listId: string;
      listRepository: ListRepository;
      todoRepository: TodoRepository;
    }
  | NextResponse
> {
  const contextOrResponse = await getAuthorizedGroupContext(params);
  if ('status' in contextOrResponse) {
    return contextOrResponse;
  }

  const { groupId, listId, docClient, tableName } = contextOrResponse;
  return {
    groupId,
    listId,
    listRepository: createListRepository(docClient, tableName),
    todoRepository: createTodoRepository(docClient, tableName),
  };
}

export async function PUT(request: Request, { params }: RouteParams): Promise<NextResponse> {
  let requestedGroupId: string | undefined;
  let requestedListId: string | undefined;
  try {
    const authorizedContextOrResponse = await getAuthorizedContext(params);
    if ('status' in authorizedContextOrResponse) {
      return authorizedContextOrResponse;
    }

    requestedGroupId = authorizedContextOrResponse.groupId;
    requestedListId = authorizedContextOrResponse.listId;

    const body = (await request.json()) as { name?: unknown };
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 1 || name.length > 100) {
      return createValidationErrorResponse(ERROR_MESSAGES.LIST_NAME_INVALID);
    }

    const existingList = await authorizedContextOrResponse.listRepository.getGroupListById(
      authorizedContextOrResponse.groupId,
      authorizedContextOrResponse.listId
    );
    if (!existingList) {
      return createNotFoundErrorResponse();
    }

    const updatedList = await authorizedContextOrResponse.listRepository.updateGroupList(
      authorizedContextOrResponse.groupId,
      authorizedContextOrResponse.listId,
      { name }
    );

    const response: GroupListResponse = { data: updatedList };
    return NextResponse.json(response);
  } catch (error) {
    console.error('グループ共有リスト更新 API の実行に失敗しました', {
      groupId: requestedGroupId,
      listId: requestedListId,
      error,
    });
    return createInternalServerErrorResponse();
  }
}

export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
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

    await authorizedContextOrResponse.todoRepository.deleteByListId(
      authorizedContextOrResponse.listId
    );
    await authorizedContextOrResponse.listRepository.deleteGroupList(
      authorizedContextOrResponse.groupId,
      authorizedContextOrResponse.listId
    );
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('グループ共有リスト削除 API の実行に失敗しました', {
      groupId: requestedGroupId,
      listId: requestedListId,
      error,
    });
    return createInternalServerErrorResponse();
  }
}
