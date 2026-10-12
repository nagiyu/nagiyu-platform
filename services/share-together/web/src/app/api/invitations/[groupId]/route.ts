import {
  ERROR_MESSAGES as GROUP_ERROR_MESSAGES,
  respondToInvitation,
} from '@nagiyu/share-together-core';
import { withApiErrorReporting } from '@/lib/api-error-reporting';
import { NextResponse } from 'next/server';
import type { ApiSuccessResponse } from '@/types';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getDynamoDBDocumentClient } from '@nagiyu/aws';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import { createGroupRepository, createMembershipRepository } from '@nagiyu/share-together-core';
import { createValidationErrorResponse, createNotFoundErrorResponse } from '@/lib/api/responses';
import { createErrorResponse, readJsonObjectBody } from '@nagiyu/nextjs';

type RouteParams = {
  params: Promise<{ groupId: string }>;
};

type InvitationAction = 'ACCEPT' | 'REJECT';

type InvitationUpdateResponse = {
  groupId: string;
  status: 'ACCEPTED' | 'REJECTED';
  updatedAt: string;
};

function isInvitationAction(action: unknown): action is InvitationAction {
  return action === 'ACCEPT' || action === 'REJECT';
}

function toInvitationStatus(status: string): InvitationUpdateResponse['status'] {
  if (status === 'ACCEPTED' || status === 'REJECTED') {
    return status;
  }
  throw new Error(ERROR_MESSAGES.INVALID_INVITATION_STATUS);
}

export const PUT = withApiErrorReporting(
  'Web API: 招待承認・拒否エラー',
  async (request: Request, { params }: RouteParams): Promise<NextResponse> => {
    try {
      const sessionOrUnauthorized = await getSessionOrUnauthorized();
      if ('status' in sessionOrUnauthorized) {
        return sessionOrUnauthorized;
      }

      const { groupId } = await params;
      if (typeof groupId !== 'string' || groupId.length === 0) {
        return createValidationErrorResponse();
      }

      const userId = sessionOrUnauthorized.user.id;
      if (typeof userId !== 'string' || userId.length === 0) {
        return createValidationErrorResponse();
      }

      const bodyResult = await readJsonObjectBody(request);
      if (!bodyResult.ok) {
        return createValidationErrorResponse();
      }
      const { body } = bodyResult;
      if (!isInvitationAction(body.action)) {
        return createValidationErrorResponse();
      }

      const tableName = process.env.DYNAMODB_TABLE_NAME;
      if (!tableName) {
        throw new Error(ERROR_MESSAGES.DYNAMODB_TABLE_NAME_REQUIRED);
      }

      const docClient =
        process.env.USE_IN_MEMORY_DB === 'true' ? undefined : getDynamoDBDocumentClient();
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
          return createNotFoundErrorResponse();
        }
        if (error.message === GROUP_ERROR_MESSAGES.INVITATION_ALREADY_RESPONDED) {
          return createErrorResponse(409, 'ALREADY_RESPONDED', ERROR_MESSAGES.ALREADY_RESPONDED);
        }
      }

      throw error;
    }
  }
);
