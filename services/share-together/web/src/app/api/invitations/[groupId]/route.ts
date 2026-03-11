import {
  ERROR_MESSAGES as GROUP_ERROR_MESSAGES,
  respondToInvitation,
} from '@nagiyu/share-together-core';
import { NextResponse } from 'next/server';
import type { ApiErrorResponse, ApiSuccessResponse } from '@/types';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getDocClient } from '@/lib/aws-clients';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { createGroupRepository, createMembershipRepository } from '@/lib/repositories';

type RouteParams = {
  params: Promise<{ groupId: string }>;
};

type InvitationAction = 'ACCEPT' | 'REJECT';

type InvitationResponseBody = {
  action?: unknown;
};

type InvitationUpdateResponse = {
  groupId: string;
  status: 'ACCEPTED' | 'REJECTED';
  updatedAt: string;
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

function createInternalServerErrorResponse(): NextResponse {
  return createErrorResponse('INTERNAL_SERVER_ERROR', ERROR_MESSAGES.INTERNAL_SERVER_ERROR, 500);
}

function isInvitationAction(action: unknown): action is InvitationAction {
  return action === 'ACCEPT' || action === 'REJECT';
}

function toInvitationStatus(status: string): InvitationUpdateResponse['status'] {
  if (status === 'ACCEPTED' || status === 'REJECTED') {
    return status;
  }
  throw new Error(ERROR_MESSAGES.INVALID_INVITATION_STATUS);
}

export async function PUT(request: Request, { params }: RouteParams): Promise<NextResponse> {
  let requestedGroupId: string | undefined;
  let requestedAction: InvitationAction | undefined;
  try {
    const sessionOrUnauthorized = await getSessionOrUnauthorized();
    if ('status' in sessionOrUnauthorized) {
      return sessionOrUnauthorized;
    }

    const { groupId } = await params;
    if (typeof groupId !== 'string' || groupId.length === 0) {
      return createValidationErrorResponse();
    }
    requestedGroupId = groupId;

    const userId = sessionOrUnauthorized.user.id;
    if (typeof userId !== 'string' || userId.length === 0) {
      return createValidationErrorResponse();
    }

    const body = (await request.json()) as InvitationResponseBody;
    if (!isInvitationAction(body.action)) {
      return createValidationErrorResponse();
    }
    requestedAction = body.action;

    const tableName = process.env.DYNAMODB_TABLE_NAME;
    if (!tableName) {
      throw new Error('DYNAMODB_TABLE_NAME is required');
    }

    const docClient = getDocClient();
    const membershipRepository = createMembershipRepository(docClient, tableName);
    const groupRepository = createGroupRepository(docClient, tableName);
    const updatedMembership = await respondToInvitation(
      {
        groupId,
        userId,
        response: body.action,
        respondedAt: new Date().toISOString(),
      },
      { groupRepository, membershipRepository }
    );

    const response: ApiSuccessResponse<InvitationUpdateResponse> = {
      data: {
        groupId: updatedMembership.groupId,
        status: toInvitationStatus(updatedMembership.status),
        updatedAt: updatedMembership.updatedAt,
      },
    };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === GROUP_ERROR_MESSAGES.INVITATION_NOT_FOUND) {
        return createErrorResponse('NOT_FOUND', ERROR_MESSAGES.NOT_FOUND, 404);
      }
      if (error.message === GROUP_ERROR_MESSAGES.INVITATION_ALREADY_RESPONDED) {
        return createErrorResponse('ALREADY_RESPONDED', ERROR_MESSAGES.ALREADY_RESPONDED, 409);
      }
    }

    console.error('招待承認・拒否 API の実行に失敗しました', {
      groupId: requestedGroupId,
      action: requestedAction,
      error,
    });
    return createInternalServerErrorResponse();
  }
}
