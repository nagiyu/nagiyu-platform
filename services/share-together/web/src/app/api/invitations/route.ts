import { type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { withApiErrorReporting } from '@/lib/api-error-reporting';
import { NextResponse } from 'next/server';
import type { InvitationSummary, InvitationsResponse } from '@/types';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { batchGetAll, getDynamoDBDocumentClient } from '@nagiyu/aws';
import { ERROR_MESSAGES } from '@/lib/constants/errors';
import {
  createGroupRepository,
  createMembershipRepository,
  createUserRepository,
} from '@nagiyu/share-together-core';
import { createValidationErrorResponse } from '@/lib/api/responses';

const USER_META_SK = '#META#';

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

    const response: InvitationsResponse = {
      data: {
        invitations,
      },
    };

    return NextResponse.json(response);
  }
);

async function getInviterNames(
  docClient: DynamoDBDocumentClient | undefined,
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

  if (!docClient) {
    throw new Error(ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
  }

  const items = await batchGetAll(
    docClient,
    tableName,
    inviterUserIds.map((inviterUserId) => ({
      PK: `USER#${inviterUserId}`,
      SK: USER_META_SK,
    }))
  );

  const inviterNames = new Map<string, string>();
  for (const item of items) {
    const userId = item['userId'];
    const name = item['name'];
    if (typeof userId === 'string' && typeof name === 'string') {
      inviterNames.set(userId, name);
    }
  }

  return inviterNames;
}
