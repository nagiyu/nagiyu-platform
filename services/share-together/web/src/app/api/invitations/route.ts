import { BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { NextResponse } from 'next/server';
import type { ApiErrorResponse, ApiSuccessResponse } from '@/types';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getAwsClients } from '@/lib/aws-clients';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import {
  createGroupRepository,
  createMembershipRepository,
  createUserRepository,
} from '@/lib/repositories';

const USER_META_SK = '#META#';

type InvitationSummary = {
  groupId: string;
  groupName: string;
  inviterUserId: string;
  inviterName: string;
  createdAt: string;
};

function createValidationErrorResponse(): NextResponse {
  const response: ApiErrorResponse = {
    error: {
      code: 'VALIDATION_ERROR',
      message: ERROR_MESSAGES.VALIDATION_ERROR,
    },
  };

  return NextResponse.json(response, { status: 400 });
}

function createInternalServerErrorResponse(): NextResponse {
  const response: ApiErrorResponse = {
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
    },
  };

  return NextResponse.json(response, { status: 500 });
}

export async function GET(): Promise<NextResponse> {
  try {
    const sessionOrUnauthorized = await getSessionOrUnauthorized();
    if ('status' in sessionOrUnauthorized) {
      return sessionOrUnauthorized;
    }

    const userId = sessionOrUnauthorized.user.id;
    if (typeof userId !== 'string' || userId.length === 0) {
      return createValidationErrorResponse();
    }

    const tableName = process.env.DYNAMODB_TABLE_NAME;
    if (!tableName) {
      throw new Error('DYNAMODB_TABLE_NAME is required');
    }

    const { docClient } = getAwsClients();
    const membershipRepository = createMembershipRepository(docClient, tableName);
    const groupRepository = createGroupRepository(docClient, tableName);

    const pendingInvitations = await membershipRepository.getPendingInvitationsByUserId(userId);
    if (pendingInvitations.length === 0) {
      const response: ApiSuccessResponse<{ invitations: InvitationSummary[] }> = {
        data: {
          invitations: [],
        },
      };

      return NextResponse.json(response);
    }

    const groupIds = [...new Set(pendingInvitations.map((invitation) => invitation.groupId))];
    const inviterUserIds = [
      ...new Set(
        pendingInvitations
          .map((invitation) => invitation.invitedBy)
          .filter((invitedBy): invitedBy is string => typeof invitedBy === 'string')
      ),
    ];

    const [groups, inviterNames] = await Promise.all([
      groupRepository.batchGetByIds(groupIds),
      getInviterNames(docClient, tableName, inviterUserIds),
    ]);

    const groupNameById = new Map(groups.map((group) => [group.groupId, group.name]));

    const invitations: InvitationSummary[] = pendingInvitations.map((invitation) => ({
      groupId: invitation.groupId,
      groupName: groupNameById.get(invitation.groupId) ?? '',
      inviterUserId: invitation.invitedBy ?? '',
      inviterName: invitation.invitedBy ? (inviterNames.get(invitation.invitedBy) ?? '') : '',
      createdAt: invitation.createdAt,
    }));

    const response: ApiSuccessResponse<{ invitations: InvitationSummary[] }> = {
      data: {
        invitations,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('招待一覧取得 API の実行に失敗しました', { error });
    return createInternalServerErrorResponse();
  }
}

async function getInviterNames(
  docClient: ReturnType<typeof getAwsClients>['docClient'],
  tableName: string,
  inviterUserIds: string[]
): Promise<Map<string, string>> {
  if (inviterUserIds.length === 0) {
    return new Map();
  }

  if (process.env.USE_IN_MEMORY_DB === 'true') {
    const userRepository = createUserRepository();
    const inviterNames = new Map<string, string>();
    for (const inviterUserId of inviterUserIds) {
      const user = await userRepository.getById(inviterUserId);
      if (user) {
        inviterNames.set(inviterUserId, user.name);
      }
    }
    return inviterNames;
  }

  const result = await docClient.send(
    new BatchGetCommand({
      RequestItems: {
        [tableName]: {
          Keys: inviterUserIds.map((inviterUserId) => ({
            PK: `USER#${inviterUserId}`,
            SK: USER_META_SK,
          })),
        },
      },
    })
  );

  const inviterNames = new Map<string, string>();
  for (const item of (result.Responses?.[tableName] ?? []) as Record<string, unknown>[]) {
    const userId = item['userId'];
    const name = item['name'];
    if (typeof userId === 'string' && typeof name === 'string') {
      inviterNames.set(userId, name);
    }
  }

  return inviterNames;
}
