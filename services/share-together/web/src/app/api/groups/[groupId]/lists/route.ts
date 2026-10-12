import { type ListRepository, type GroupList } from '@nagiyu/share-together-core';
import { withApiErrorReporting } from '@/lib/api-error-reporting';
import { NextResponse } from 'next/server';
import { readJsonObjectBody } from '@nagiyu/nextjs';
import type { GroupListsResponse } from '@/types';
import { getAuthorizedGroupContext } from '@/lib/api/authorization';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { createListRepository } from '@nagiyu/share-together-core';
import { createValidationErrorResponse } from '@/lib/api/responses';

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

export const GET = withApiErrorReporting(
  'Web API: グループ共有リスト一覧取得エラー',
  async (_request: Request, { params }: RouteParams): Promise<NextResponse> => {
    const authorizedContextOrResponse = await getAuthorizedContext(params);
    if ('status' in authorizedContextOrResponse) {
      return authorizedContextOrResponse;
    }

    const lists = await authorizedContextOrResponse.listRepository.getGroupListsByGroupId(
      authorizedContextOrResponse.groupId
    );

    const response: GroupListsResponse = { data: { lists } };
    return NextResponse.json(response);
  }
);

export const POST = withApiErrorReporting(
  'Web API: グループ共有リスト作成エラー',
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

    const createdList: GroupList = await authorizedContextOrResponse.listRepository.createGroupList(
      {
        listId: crypto.randomUUID(),
        groupId: authorizedContextOrResponse.groupId,
        name,
        createdBy: authorizedContextOrResponse.userId,
      }
    );

    return NextResponse.json({ data: createdList }, { status: 201 });
  }
);
