import { withApiErrorReporting } from '@/lib/api-error-reporting';
import { NextResponse } from 'next/server';
import type { InvitationSummary, InvitationsResponse } from '@/types';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getDynamoDBDocumentClient } from '@nagiyu/aws';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import {
  createGroupRepository,
  createMembershipRepository,
  createUserRepository,
  type UserRepository,
} from '@nagiyu/share-together-core';
import { createValidationErrorResponse } from '@/lib/api/responses';

export const GET = withApiErrorReporting(
  'Web API: 招待一覧取得エラー',
  async (): Promise<NextResponse> => {
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
      throw new Error(ERROR_MESSAGES.DYNAMODB_TABLE_NAME_REQUIRED);
    }

    const docClient =
      process.env.USE_IN_MEMORY_DB === 'true' ? undefined : getDynamoDBDocumentClient();
    const membershipRepository = createMembershipRepository(docClient, tableName);
    const groupRepository = createGroupRepository(docClient, tableName);
    const userRepository = createUserRepository(docClient, tableName);

    const pendingInvitations = await membershipRepository.getPendingInvitationsByUserId(userId);
    if (pendingInvitations.length === 0) {
      const response: InvitationsResponse = {
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
      getInviterNames(userRepository, inviterUserIds),
    ]);

    const groupNameById = new Map(groups.map((group) => [group.groupId, group.name]));

    const invitations: InvitationSummary[] = pendingInvitations.map((invitation) => ({
      groupId: invitation.groupId,
      groupName: groupNameById.get(invitation.groupId) ?? '',
      inviterUserId: invitation.invitedBy ?? '',
      inviterName: invitation.invitedBy ? (inviterNames.get(invitation.invitedBy) ?? '') : '',
      createdAt: invitation.createdAt,
    }));

    const response: InvitationsResponse = {
      data: {
        invitations,
      },
    };

    return NextResponse.json(response);
  }
);

async function getInviterNames(
  userRepository: UserRepository,
  inviterUserIds: string[]
): Promise<Map<string, string>> {
  const users = await userRepository.batchGetByIds(inviterUserIds);
  return new Map(users.map((user) => [user.userId, user.name]));
}
