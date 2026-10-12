import {
  type Group,
  type GroupRepository,
  type MembershipRepository,
} from '@nagiyu/share-together-core';
import { withApiErrorReporting } from '@/lib/api-error-reporting';
import { NextResponse, type NextRequest } from 'next/server';
import type { GroupResponse } from '@/types';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getDynamoDBDocumentClient } from '@nagiyu/aws';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { createGroupRepository, createMembershipRepository } from '@nagiyu/share-together-core';
import { createValidationErrorResponse, createNotFoundErrorResponse } from '@/lib/api/responses';
import { normalizeGroupName } from '@/lib/api/validation';
import { createErrorResponse, readJsonObjectBody } from '@nagiyu/nextjs';

const CORE_ERROR_MESSAGES = {
  GROUP_NOT_FOUND: 'グループが見つかりません',
} as const;

interface RouteParams {
  params: Promise<{
    groupId: string;
  }>;
}

function toNotFoundIfGroupMissing(error: unknown): NextResponse | null {
  if (error instanceof Error && error.message === CORE_ERROR_MESSAGES.GROUP_NOT_FOUND) {
    return createNotFoundErrorResponse();
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
  const group = await groupRepository.getById(groupId);

  if (!group) {
    return createNotFoundErrorResponse();
  }

  if (group.ownerUserId !== userId) {
    return createErrorResponse(403, 'OWNER_ONLY', ERROR_MESSAGES.OWNER_ONLY);
  }

  return { group, groupRepository, membershipRepository };
}

export const PUT = withApiErrorReporting(
  'Web API: グループ更新エラー',
  async (request: NextRequest, { params }: RouteParams): Promise<NextResponse> => {
    const { groupId } = await params;

    try {
      const ownedGroupOrResponse = await getOwnedGroup(groupId);
      if ('status' in ownedGroupOrResponse) {
        return ownedGroupOrResponse;
      }

      const bodyResult = await readJsonObjectBody(request);
      if (!bodyResult.ok) {
        return createValidationErrorResponse();
      }
      const { body } = bodyResult;
      const name = normalizeGroupName(body.name);
      if (name === null) {
        return createValidationErrorResponse();
      }

      const updatedGroup = await ownedGroupOrResponse.groupRepository.update(groupId, {
        name,
      });

      const response: GroupResponse = {
        data: updatedGroup,
      };
      return NextResponse.json(response);
    } catch (error) {
      const notFoundResponse = toNotFoundIfGroupMissing(error);
      if (notFoundResponse) {
        return notFoundResponse;
      }

      throw error;
    }
  }
);

export const DELETE = withApiErrorReporting(
  'Web API: グループ削除エラー',
  async (_request: NextRequest, { params }: RouteParams): Promise<NextResponse> => {
    const { groupId } = await params;

    try {
      const ownedGroupOrResponse = await getOwnedGroup(groupId);
      if ('status' in ownedGroupOrResponse) {
        return ownedGroupOrResponse;
      }

      await ownedGroupOrResponse.membershipRepository.deleteByGroupId(groupId);
      await ownedGroupOrResponse.groupRepository.delete(groupId);
      return new NextResponse(null, { status: 204 });
    } catch (error) {
      const notFoundResponse = toNotFoundIfGroupMissing(error);
      if (notFoundResponse) {
        return notFoundResponse;
      }

      throw error;
    }
  }
);
