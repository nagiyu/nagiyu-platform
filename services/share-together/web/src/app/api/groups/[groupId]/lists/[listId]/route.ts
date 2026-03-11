import { type ListRepository, type TodoRepository } from '@nagiyu/share-together-core';
import { NextResponse } from 'next/server';
import type { ApiErrorResponse, GroupListResponse } from '@/types';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getDocClient } from '@/lib/aws-clients';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import {
  createListRepository,
  createMembershipRepository,
  createTodoRepository,
} from '@/lib/repositories';

interface RouteParams {
  params: Promise<{ groupId: string; listId: string }>;
}

function createErrorResponse(code: string, message: string, status: number): NextResponse {
  const response: ApiErrorResponse = {
    error: {
      code,
      message,
    },
  };

  return NextResponse.json(response, { status });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
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
  const sessionOrUnauthorized = await getSessionOrUnauthorized();
  if ('status' in sessionOrUnauthorized) {
    return sessionOrUnauthorized;
  }

  const { groupId, listId } = await params;
  const userId = sessionOrUnauthorized.user.id;
  if (!isNonEmptyString(groupId) || !isNonEmptyString(listId) || !isNonEmptyString(userId)) {
    return createErrorResponse('VALIDATION_ERROR', ERROR_MESSAGES.VALIDATION_ERROR, 400);
  }

  const tableName = process.env.DYNAMODB_TABLE_NAME;
  if (!tableName) {
    throw new Error(ERROR_MESSAGES.DYNAMODB_TABLE_NAME_REQUIRED);
  }

  const docClient = getDocClient();
  const membershipRepository = createMembershipRepository(docClient, tableName);
  const membership = await membershipRepository.getById(groupId, userId);
  if (!membership || membership.status !== 'ACCEPTED') {
    return createErrorResponse('FORBIDDEN', ERROR_MESSAGES.FORBIDDEN, 403);
  }

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
      return createErrorResponse('VALIDATION_ERROR', ERROR_MESSAGES.LIST_NAME_INVALID, 400);
    }

    const existingList = await authorizedContextOrResponse.listRepository.getGroupListById(
      authorizedContextOrResponse.groupId,
      authorizedContextOrResponse.listId
    );
    if (!existingList) {
      return createErrorResponse('NOT_FOUND', ERROR_MESSAGES.NOT_FOUND, 404);
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
    return createErrorResponse('INTERNAL_SERVER_ERROR', ERROR_MESSAGES.INTERNAL_SERVER_ERROR, 500);
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
      return createErrorResponse('NOT_FOUND', ERROR_MESSAGES.NOT_FOUND, 404);
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
    return createErrorResponse('INTERNAL_SERVER_ERROR', ERROR_MESSAGES.INTERNAL_SERVER_ERROR, 500);
  }
}
