import { type ListRepository, type TodoRepository } from '@nagiyu/share-together-core';
import { withApiErrorReporting } from '@/lib/api-error-reporting';
import { NextResponse } from 'next/server';
import { readJsonObjectBody } from '@nagiyu/nextjs';
import type { GroupListResponse } from '@/types';
import { getAuthorizedGroupContext } from '@/lib/api/authorization';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { createListRepository, createTodoRepository } from '@nagiyu/share-together-core';
import { createValidationErrorResponse, createNotFoundErrorResponse } from '@/lib/api/responses';

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

export const PUT = withApiErrorReporting(
  'Web API: グループ共有リスト更新エラー',
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
  }
);

export const DELETE = withApiErrorReporting(
  'Web API: グループ共有リスト削除エラー',
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

    await authorizedContextOrResponse.todoRepository.deleteByListId(
      authorizedContextOrResponse.listId
    );
    await authorizedContextOrResponse.listRepository.deleteGroupList(
      authorizedContextOrResponse.groupId,
      authorizedContextOrResponse.listId
    );
    return new NextResponse(null, { status: 204 });
  }
);
