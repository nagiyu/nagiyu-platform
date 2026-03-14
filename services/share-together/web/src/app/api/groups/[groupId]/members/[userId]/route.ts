import {
  ERROR_MESSAGES as GROUP_ERROR_MESSAGES,
  leaveGroup,
  removeMember,
  type GroupOperationDependencies,
  type MembershipRepository,
} from '@nagiyu/share-together-core';
import { NextResponse } from 'next/server';
import type { ApiErrorResponse } from '@/types';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getDynamoDBDocumentClient } from '@nagiyu/aws';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { createGroupRepository, createMembershipRepository } from '@/lib/repositories';

function createErrorResponse(code: string, message: string, status: number): NextResponse {
  const response: ApiErrorResponse = {
    error: {
      code,
      message,
    },
  };

  return NextResponse.json(response, { status });
}

function createNoContentResponse(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

function createDependencies(tableName: string): GroupOperationDependencies & {
  membershipRepository: MembershipRepository;
} {
  const docClient = process.env.USE_IN_MEMORY_DB === 'true' ? undefined : getDynamoDBDocumentClient();

  return {
    groupRepository: createGroupRepository(docClient, tableName),
    membershipRepository: createMembershipRepository(docClient, tableName),
  };
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ groupId: string; userId: string }> }
): Promise<NextResponse> {
  try {
    const sessionOrUnauthorized = await getSessionOrUnauthorized();
    if ('status' in sessionOrUnauthorized) {
      return sessionOrUnauthorized;
    }

    const { groupId, userId } = await params;
    if (!groupId || !userId) {
      return createErrorResponse('VALIDATION_ERROR', ERROR_MESSAGES.VALIDATION_ERROR, 400);
    }

    const tableName = process.env.DYNAMODB_TABLE_NAME;
    if (!tableName) {
      throw new Error(ERROR_MESSAGES.DYNAMODB_TABLE_NAME_REQUIRED);
    }

    const userIdFromSession = sessionOrUnauthorized.user.id;
    if (typeof userIdFromSession !== 'string' || userIdFromSession.length === 0) {
      return createErrorResponse('VALIDATION_ERROR', ERROR_MESSAGES.VALIDATION_ERROR, 400);
    }

    const dependencies = createDependencies(tableName);

    if (userIdFromSession === userId) {
      await leaveGroup({ groupId, userId }, dependencies);
      return createNoContentResponse();
    }

    const requesterMembership = await dependencies.membershipRepository.getById(
      groupId,
      userIdFromSession
    );
    if (requesterMembership?.role !== 'OWNER') {
      return createErrorResponse('OWNER_ONLY', ERROR_MESSAGES.OWNER_ONLY, 403);
    }

    await removeMember(groupId, userId, dependencies);
    return createNoContentResponse();
  } catch (error) {
    if (error instanceof Error && error.message === GROUP_ERROR_MESSAGES.MEMBERSHIP_NOT_FOUND) {
      return createErrorResponse('NOT_FOUND', ERROR_MESSAGES.NOT_FOUND, 404);
    }

    if (error instanceof Error && error.message === GROUP_ERROR_MESSAGES.OWNER_CANNOT_LEAVE) {
      return createErrorResponse('OWNER_CANNOT_LEAVE', ERROR_MESSAGES.OWNER_CANNOT_LEAVE, 403);
    }

    console.error('グループメンバー除外・脱退 API の実行に失敗しました', { error });
    return createErrorResponse('INTERNAL_SERVER_ERROR', ERROR_MESSAGES.INTERNAL_SERVER_ERROR, 500);
  }
}
