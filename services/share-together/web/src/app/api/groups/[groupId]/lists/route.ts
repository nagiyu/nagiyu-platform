import { type ListRepository, type GroupList } from '@nagiyu/share-together-core';
import { NextResponse } from 'next/server';
import type { ApiErrorResponse, GroupListsResponse } from '@/types';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getDynamoDBDocumentClient } from '@nagiyu/aws';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { createListRepository, createMembershipRepository } from '@/lib/repositories';

type RouteParams = {
  params: Promise<{ groupId: string }>;
};

function createErrorResponse(code: string, message: string, status: number): NextResponse {
  const response: ApiErrorResponse = {
    error: {
      code,
      message,
    },
  };

  return NextResponse.json(response, { status });
}

async function getAuthorizedContext(params: RouteParams['params']): Promise<
  | {
      groupId: string;
      userId: string;
      listRepository: ListRepository;
    }
  | NextResponse
> {
  const sessionOrUnauthorized = await getSessionOrUnauthorized();
  if ('status' in sessionOrUnauthorized) {
    return sessionOrUnauthorized;
  }

  const { groupId } = await params;
  const userId = sessionOrUnauthorized.user.id;

  const tableName = process.env.DYNAMODB_TABLE_NAME;
  if (!tableName) {
    throw new Error(ERROR_MESSAGES.DYNAMODB_TABLE_NAME_REQUIRED);
  }

  const docClient =
    process.env.USE_IN_MEMORY_DB === 'true' ? undefined : getDynamoDBDocumentClient();
  const membershipRepository = createMembershipRepository(docClient, tableName);
  const membership = await membershipRepository.getById(groupId, userId);
  if (!membership || membership.status !== 'ACCEPTED') {
    return createErrorResponse('FORBIDDEN', ERROR_MESSAGES.FORBIDDEN, 403);
  }

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
    return createErrorResponse('INTERNAL_SERVER_ERROR', ERROR_MESSAGES.INTERNAL_SERVER_ERROR, 500);
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
      return createErrorResponse('VALIDATION_ERROR', ERROR_MESSAGES.LIST_NAME_INVALID, 400);
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
    return createErrorResponse('INTERNAL_SERVER_ERROR', ERROR_MESSAGES.INTERNAL_SERVER_ERROR, 500);
  }
}
