import {
  createGroup,
  DynamoDBGroupRepository,
  DynamoDBMembershipRepository,
  type Group,
} from '@nagiyu/share-together-core';
import { NextResponse } from 'next/server';
import type { ApiErrorResponse, ApiSuccessResponse } from '@/types';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getAwsClients } from '@/lib/aws-clients';
import { ERROR_MESSAGES } from '@/lib/constants/errors';

interface GroupSummary extends Group {
  isOwner: boolean;
}

function createErrorResponse(status: number, code: string, message: string): NextResponse {
  const response: ApiErrorResponse = {
    error: {
      code,
      message,
    },
  };

  return NextResponse.json(response, { status });
}

export async function GET(): Promise<NextResponse> {
  try {
    const sessionOrUnauthorized = await getSessionOrUnauthorized();
    if ('status' in sessionOrUnauthorized) {
      return sessionOrUnauthorized;
    }

    const userId = sessionOrUnauthorized.user.id;

    const tableName = process.env.DYNAMODB_TABLE_NAME;
    if (!tableName) {
      throw new Error('DYNAMODB_TABLE_NAME is required');
    }

    const { docClient } = getAwsClients();
    const groupRepository = new DynamoDBGroupRepository(docClient, tableName);
    const membershipRepository = new DynamoDBMembershipRepository(docClient, tableName);

    const memberships = await membershipRepository.getByUserId(userId);
    const acceptedMemberships = memberships.filter(
      (membership) => membership.status === 'ACCEPTED'
    );
    const groupIds = acceptedMemberships.map((membership) => membership.groupId);
    const groups = await groupRepository.batchGetByIds(groupIds);
    const isOwnerByGroupId = new Map(
      acceptedMemberships.map(
        (membership) => [membership.groupId, membership.role === 'OWNER'] as const
      )
    );
    const groupSummaries: GroupSummary[] = groups.map((group) => ({
      ...group,
      isOwner: isOwnerByGroupId.get(group.groupId) === true,
    }));

    const response: ApiSuccessResponse<{ groups: GroupSummary[] }> = {
      data: { groups: groupSummaries },
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error('グループ一覧取得 API の実行に失敗しました', { error });
    return createErrorResponse(500, 'INTERNAL_SERVER_ERROR', ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const sessionOrUnauthorized = await getSessionOrUnauthorized();
    if ('status' in sessionOrUnauthorized) {
      return sessionOrUnauthorized;
    }

    const userId = sessionOrUnauthorized.user.id;

    const body = (await request.json()) as { name?: unknown };
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length === 0 || name.length > 100) {
      return createErrorResponse(400, 'VALIDATION_ERROR', ERROR_MESSAGES.VALIDATION_ERROR);
    }

    const tableName = process.env.DYNAMODB_TABLE_NAME;
    if (!tableName) {
      throw new Error('DYNAMODB_TABLE_NAME is required');
    }

    const { docClient } = getAwsClients();
    const groupRepository = new DynamoDBGroupRepository(docClient, tableName);
    const membershipRepository = new DynamoDBMembershipRepository(docClient, tableName);
    const groupId = crypto.randomUUID();
    const { group } = await createGroup(
      {
        groupId,
        name,
        ownerUserId: userId,
      },
      { groupRepository, membershipRepository }
    );

    const response: ApiSuccessResponse<Group> = { data: group };
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('グループ作成 API の実行に失敗しました', { error });
    return createErrorResponse(500, 'INTERNAL_SERVER_ERROR', ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
  }
}
