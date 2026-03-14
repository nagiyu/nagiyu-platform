import { ERROR_MESSAGES as GROUP_ERROR_MESSAGES, inviteMember } from '@nagiyu/share-together-core';
import { NextResponse } from 'next/server';
import type { ApiErrorResponse } from '@/types';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getDynamoDBDocumentClient } from '@nagiyu/aws';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import {
  createGroupRepository,
  createMembershipRepository,
  createUserRepository,
} from '@/lib/repositories';

type RouteParams = {
  params: Promise<{ groupId: string }>;
};

type InviteRequestBody = {
  email?: unknown;
  userId?: unknown;
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

function createValidationErrorResponse(): NextResponse {
  return createErrorResponse('VALIDATION_ERROR', ERROR_MESSAGES.VALIDATION_ERROR, 400);
}

function createForbiddenResponse(
  code: string = 'FORBIDDEN',
  message: string = ERROR_MESSAGES.FORBIDDEN
): NextResponse {
  return createErrorResponse(code, message, 403);
}

function createNotFoundResponse(): NextResponse {
  return createErrorResponse('NOT_FOUND', ERROR_MESSAGES.NOT_FOUND, 404);
}

function createConflictResponse(code: string, message: string): NextResponse {
  return createErrorResponse(code, message, 409);
}

function createInternalServerErrorResponse(): NextResponse {
  return createErrorResponse('INTERNAL_SERVER_ERROR', ERROR_MESSAGES.INTERNAL_SERVER_ERROR, 500);
}

function resolveGroupId(groupId: string): string | null {
  return groupId.length > 0 ? groupId : null;
}

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  let requestedGroupId: string | undefined;
  try {
    const sessionOrUnauthorized = await getSessionOrUnauthorized();
    if ('status' in sessionOrUnauthorized) {
      return sessionOrUnauthorized;
    }

    const { groupId } = await params;
    const resolvedGroupId = resolveGroupId(groupId);
    if (!resolvedGroupId) {
      return createValidationErrorResponse();
    }
    requestedGroupId = resolvedGroupId;

    const userId = sessionOrUnauthorized.user.id;
    if (typeof userId !== 'string' || userId.length === 0) {
      return createValidationErrorResponse();
    }

    const tableName = process.env.DYNAMODB_TABLE_NAME;
    if (!tableName) {
      throw new Error(ERROR_MESSAGES.DYNAMODB_TABLE_NAME_REQUIRED);
    }

    const docClient =
      process.env.USE_IN_MEMORY_DB === 'true' ? undefined : getDynamoDBDocumentClient();
    const membershipRepository = createMembershipRepository(docClient, tableName);
    const userRepository = createUserRepository(docClient, tableName);

    const requesterMembership = await membershipRepository.getById(resolvedGroupId, userId);
    if (!requesterMembership || requesterMembership.status !== 'ACCEPTED') {
      return createForbiddenResponse();
    }

    const memberships = await membershipRepository.getByGroupId(resolvedGroupId);
    const acceptedMemberships = memberships.filter(
      (membership) => membership.status === 'ACCEPTED'
    );
    const users = await Promise.all(
      acceptedMemberships.map((membership) => userRepository.getById(membership.userId))
    );

    const members = acceptedMemberships
      .map((membership, index) => {
        const user = users[index];
        if (!user) {
          return null;
        }

        return {
          userId: membership.userId,
          name: user.name,
          email: user.email,
          image: user.image ?? null,
          role: membership.role,
          joinedAt: membership.respondedAt ?? membership.createdAt,
        };
      })
      .filter((member): member is NonNullable<typeof member> => member !== null);

    return NextResponse.json({ data: { members } });
  } catch (error) {
    console.error('グループメンバー一覧取得 API の実行に失敗しました', {
      groupId: requestedGroupId,
      error,
    });
    return createInternalServerErrorResponse();
  }
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  let requestedGroupId: string | undefined;
  let inviterUserId: string | undefined;
  try {
    const sessionOrUnauthorized = await getSessionOrUnauthorized();
    if ('status' in sessionOrUnauthorized) {
      return sessionOrUnauthorized;
    }

    const { groupId } = await params;
    const resolvedGroupId = resolveGroupId(groupId);
    if (!resolvedGroupId) {
      return createValidationErrorResponse();
    }
    requestedGroupId = resolvedGroupId;

    const userId = sessionOrUnauthorized.user.id;
    if (typeof userId !== 'string' || userId.length === 0) {
      return createValidationErrorResponse();
    }
    inviterUserId = userId;

    const body = (await request.json()) as InviteRequestBody;
    const userIdInput = typeof body.userId === 'string' ? body.userId.trim() : '';
    const emailInput = typeof body.email === 'string' ? body.email.trim() : '';
    const hasUserId = userIdInput.length > 0;
    const hasEmail = emailInput.length > 0;
    if ((!hasUserId && !hasEmail) || (hasUserId && hasEmail)) {
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
    const userRepository = createUserRepository(docClient, tableName);

    const group = await groupRepository.getById(resolvedGroupId);
    if (!group) {
      return createNotFoundResponse();
    }

    const requesterMembership = await membershipRepository.getById(resolvedGroupId, userId);
    if (!requesterMembership || requesterMembership.status !== 'ACCEPTED') {
      return createForbiddenResponse();
    }

    if (group.ownerUserId !== userId) {
      return createForbiddenResponse('OWNER_ONLY', ERROR_MESSAGES.OWNER_ONLY);
    }

    const invitee = userIdInput
      ? await userRepository.getById(userIdInput)
      : await userRepository.getByEmail(emailInput);
    if (!invitee) {
      return createNotFoundResponse();
    }

    const now = new Date().toISOString();
    const membership = await inviteMember(
      {
        groupId: resolvedGroupId,
        userId: invitee.userId,
        invitedBy: userId,
        invitedAt: now,
      },
      { groupRepository, membershipRepository }
    );

    return NextResponse.json(
      {
        data: {
          groupId: membership.groupId,
          inviteeUserId: membership.userId,
          inviteeName: invitee.name,
          status: membership.status,
          createdAt: membership.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === GROUP_ERROR_MESSAGES.DUPLICATE_INVITATION) {
        return createConflictResponse('ALREADY_INVITED', ERROR_MESSAGES.ALREADY_INVITED);
      }
      if (error.message === GROUP_ERROR_MESSAGES.ALREADY_GROUP_MEMBER) {
        return createConflictResponse('ALREADY_MEMBER', ERROR_MESSAGES.ALREADY_MEMBER);
      }
      if (error.message === GROUP_ERROR_MESSAGES.MEMBER_LIMIT_EXCEEDED) {
        return createConflictResponse(
          'MEMBER_LIMIT_EXCEEDED',
          ERROR_MESSAGES.MEMBER_LIMIT_EXCEEDED
        );
      }
    }

    console.error('グループメンバー招待 API の実行に失敗しました', {
      groupId: requestedGroupId,
      inviterUserId,
      error,
    });
    return createInternalServerErrorResponse();
  }
}
