import { type ListRepository, type GroupList } from '@nagiyu/share-together-core';
import { NextResponse } from 'next/server';
import type { GroupListsResponse } from '@/types';
import { getAuthorizedGroupContext } from '@/lib/api/authorization';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { createListRepository } from '@nagiyu/share-together-core';
import {
  createValidationErrorResponse,
  createInternalServerErrorResponse,
} from '@/lib/api/responses';

type RouteParams = {
  params: Promise<{ groupId: string }>;
};

async function getAuthorizedContext(params: RouteParams['params']): Promise<
  | {
      groupId: string;
      userId: string;
      listRepository: ListRepository;
    }
  | NextResponse
> {
  const contextOrResponse = await getAuthorizedGroupContext(params);
  if ('status' in contextOrResponse) {
    return contextOrResponse;
  }

  const { groupId, userId, docClient, tableName } = contextOrResponse;
  return {
    groupId,
    userId,
    listRepository: createListRepository(docClient, tableName),
  };
}

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  let requestedGroupId: string | undefined;
  try {
    const authorizedContextOrResponse = await getAuthorizedContext(params);
    if ('status' in authorizedContextOrResponse) {
      return authorizedContextOrResponse;
    }

    requestedGroupId = authorizedContextOrResponse.groupId;
    const lists = await authorizedContextOrResponse.listRepository.getGroupListsByGroupId(
      authorizedContextOrResponse.groupId
    );

    const response: GroupListsResponse = { data: { lists } };
    return NextResponse.json(response);
  } catch (error) {
    console.error('グループ共有リスト一覧取得 API の実行に失敗しました', {
      groupId: requestedGroupId,
      error,
    });
    return createInternalServerErrorResponse();
  }
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  let requestedGroupId: string | undefined;
  let requestedUserId: string | undefined;
  try {
    const authorizedContextOrResponse = await getAuthorizedContext(params);
    if ('status' in authorizedContextOrResponse) {
      return authorizedContextOrResponse;
    }

    requestedGroupId = authorizedContextOrResponse.groupId;
    requestedUserId = authorizedContextOrResponse.userId;

    const body = (await request.json()) as { name?: unknown };
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 1 || name.length > 100) {
      return createValidationErrorResponse(ERROR_MESSAGES.LIST_NAME_INVALID);
    }

    const createdList: GroupList = await authorizedContextOrResponse.listRepository.createGroupList(
      {
        listId: crypto.randomUUID(),
        groupId: authorizedContextOrResponse.groupId,
        name,
        createdBy: authorizedContextOrResponse.userId,
      }
    );

    return NextResponse.json({ data: createdList }, { status: 201 });
  } catch (error) {
    console.error('グループ共有リスト作成 API の実行に失敗しました', {
      groupId: requestedGroupId,
      userId: requestedUserId,
      error,
    });
    return createInternalServerErrorResponse();
  }
}
