import {
  type Group,
  type GroupRepository,
  type MembershipRepository,
} from '@nagiyu/share-together-core';
import { NextResponse, type NextRequest } from 'next/server';
import type { ApiErrorResponse, GroupResponse } from '@/types';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getAwsClients } from '@/lib/aws-clients';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { createGroupRepository, createMembershipRepository } from '@/lib/repositories';

const CORE_ERROR_MESSAGES = {
  GROUP_NOT_FOUND: 'グループが見つかりません',
} as const;

interface RouteParams {
  params: Promise<{
    groupId: string;
  }>;
}

interface UpdateGroupRequestBody {
  name?: string;
}

function createErrorResponse(
  status: number,
  code: string,
  message: string,
  details?: unknown
): NextResponse {
  const response: ApiErrorResponse = {
    error: {
      code,
      message,
      details,
    },
  };

  return NextResponse.json(response, { status });
}

function validateGroupName(name: unknown): name is string {
  return typeof name === 'string' && name.trim().length > 0 && name.length <= 100;
}

function toNotFoundIfGroupMissing(error: unknown): NextResponse | null {
  if (error instanceof Error && error.message === CORE_ERROR_MESSAGES.GROUP_NOT_FOUND) {
    return createErrorResponse(404, 'NOT_FOUND', ERROR_MESSAGES.NOT_FOUND);
  }

  return null;
}

async function getOwnedGroup(groupId: string): Promise<
  | {
      group: Group;
      groupRepository: GroupRepository;
      membershipRepository: MembershipRepository;
    }
  | NextResponse
> {
  const sessionOrUnauthorized = await getSessionOrUnauthorized();
  if ('status' in sessionOrUnauthorized) {
    return sessionOrUnauthorized;
  }

  const userId = sessionOrUnauthorized.user.id;
  if (typeof userId !== 'string' || userId.length === 0 || groupId.length === 0) {
    return createErrorResponse(400, 'VALIDATION_ERROR', ERROR_MESSAGES.VALIDATION_ERROR);
  }

  const tableName = process.env.DYNAMODB_TABLE_NAME;
  if (!tableName) {
    throw new Error('DYNAMODB_TABLE_NAME is required');
  }

  const { docClient } = getAwsClients();
  const groupRepository = createGroupRepository(docClient, tableName);
  const membershipRepository = createMembershipRepository(docClient, tableName);
  const group = await groupRepository.getById(groupId);

  if (!group) {
    return createErrorResponse(404, 'NOT_FOUND', ERROR_MESSAGES.NOT_FOUND);
  }

  if (group.ownerUserId !== userId) {
    return createErrorResponse(403, 'OWNER_ONLY', ERROR_MESSAGES.OWNER_ONLY);
  }

  return { group, groupRepository, membershipRepository };
}

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { groupId } = await params;

  try {
    const ownedGroupOrResponse = await getOwnedGroup(groupId);
    if ('status' in ownedGroupOrResponse) {
      return ownedGroupOrResponse;
    }

    const body = (await request.json()) as UpdateGroupRequestBody;
    if (!validateGroupName(body.name)) {
      return createErrorResponse(400, 'VALIDATION_ERROR', ERROR_MESSAGES.VALIDATION_ERROR);
    }

    const updatedGroup = await ownedGroupOrResponse.groupRepository.update(groupId, {
      name: body.name,
    });

    const response: GroupResponse = {
      data: updatedGroup,
    };
    return NextResponse.json(response);
  } catch (error: unknown) {
    const notFoundResponse = toNotFoundIfGroupMissing(error);
    if (notFoundResponse) {
      return notFoundResponse;
    }

    console.error('グループ更新 API の実行に失敗しました', { groupId, error });
    return createErrorResponse(500, 'INTERNAL_SERVER_ERROR', ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { groupId } = await params;

  try {
    const ownedGroupOrResponse = await getOwnedGroup(groupId);
    if ('status' in ownedGroupOrResponse) {
      return ownedGroupOrResponse;
    }

    await ownedGroupOrResponse.membershipRepository.deleteByGroupId(groupId);
    await ownedGroupOrResponse.groupRepository.delete(groupId);
    return new NextResponse(null, { status: 204 });
  } catch (error: unknown) {
    const notFoundResponse = toNotFoundIfGroupMissing(error);
    if (notFoundResponse) {
      return notFoundResponse;
    }

    console.error('グループ削除 API の実行に失敗しました', { groupId, error });
    return createErrorResponse(500, 'INTERNAL_SERVER_ERROR', ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
  }
}
