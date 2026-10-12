import { createGroup, type Group } from '@nagiyu/share-together-core';
import { withApiErrorReporting } from '@/lib/api-error-reporting';
import { NextResponse } from 'next/server';
import { readJsonObjectBody } from '@nagiyu/nextjs';
import type { ApiSuccessResponse } from '@/types';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getDynamoDBDocumentClient } from '@nagiyu/aws';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { createGroupRepository, createMembershipRepository } from '@nagiyu/share-together-core';
import { createValidationErrorResponse } from '@/lib/api/responses';
import { normalizeGroupName } from '@/lib/api/validation';

interface GroupSummary extends Group {
  isOwner: boolean;
}

export const GET = withApiErrorReporting(
  'Web API: グループ一覧取得エラー',
  async (): Promise<NextResponse> => {
    const sessionOrUnauthorized = await getSessionOrUnauthorized();
    if ('status' in sessionOrUnauthorized) {
      return sessionOrUnauthorized;
    }

    const userId = sessionOrUnauthorized.user.id;

    const tableName = process.env.DYNAMODB_TABLE_NAME;
    if (!tableName) {
      throw new Error(ERROR_MESSAGES.DYNAMODB_TABLE_NAME_REQUIRED);
    }

    const docClient =
      process.env.USE_IN_MEMORY_DB === 'true' ? undefined : getDynamoDBDocumentClient();
    const groupRepository = createGroupRepository(docClient, tableName);
    const membershipRepository = createMembershipRepository(docClient, tableName);

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

    const response: ApiSuccessResponse<{ groups: GroupSummary[]; currentUserId: string }> = {
      data: { groups: groupSummaries, currentUserId: userId },
    };
    return NextResponse.json(response);
  }
);

export const POST = withApiErrorReporting(
  'Web API: グループ作成エラー',
  async (request: Request): Promise<NextResponse> => {
    const sessionOrUnauthorized = await getSessionOrUnauthorized();
    if ('status' in sessionOrUnauthorized) {
      return sessionOrUnauthorized;
    }

    const userId = sessionOrUnauthorized.user.id;

    const bodyResult = await readJsonObjectBody(request);
    if (!bodyResult.ok) {
      return createValidationErrorResponse();
    }
    const { body } = bodyResult;
    const name = normalizeGroupName(body.name);
    if (name === null) {
      return createValidationErrorResponse();
    }

    const tableName = process.env.DYNAMODB_TABLE_NAME;
    if (!tableName) {
      throw new Error(ERROR_MESSAGES.DYNAMODB_TABLE_NAME_REQUIRED);
    }

    const docClient =
      process.env.USE_IN_MEMORY_DB === 'true' ? undefined : getDynamoDBDocumentClient();
    const groupRepository = createGroupRepository(docClient, tableName);
    const membershipRepository = createMembershipRepository(docClient, tableName);
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
  }
);
