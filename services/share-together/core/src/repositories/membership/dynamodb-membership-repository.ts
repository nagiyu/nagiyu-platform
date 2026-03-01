import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type {
  CreateGroupMembershipInput,
  GroupMembership,
  GroupMembershipStatus,
  GroupRole,
  UpdateGroupMembershipInput,
} from '../../types/index.js';
import type { MembershipRepository } from './membership-repository.interface.js';

const MEMBER_SK_PREFIX = 'MEMBER#';
const GSI1_INDEX_NAME = 'GSI1';

const ERROR_MESSAGES = {
  INVALID_MEMBERSHIP_DATA: 'メンバーシップ情報の形式が不正です',
  MEMBERSHIP_NOT_FOUND: 'メンバーシップが見つかりません',
} as const;

export class DynamoDBMembershipRepository implements MembershipRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
  }

  public async getById(groupId: string, userId: string): Promise<GroupMembership | null> {
    const result = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: this.buildGroupPk(groupId),
          SK: this.buildMemberSk(userId),
        },
      })
    );

    if (!result.Item) {
      return null;
    }

    return this.toMembership(result.Item as Record<string, unknown>);
  }

  public async getByGroupId(groupId: string): Promise<GroupMembership[]> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :memberSkPrefix)',
        ExpressionAttributeNames: {
          '#pk': 'PK',
          '#sk': 'SK',
        },
        ExpressionAttributeValues: {
          ':pk': this.buildGroupPk(groupId),
          ':memberSkPrefix': MEMBER_SK_PREFIX,
        },
      })
    );

    return (result.Items ?? []).map((item) => this.toMembership(item as Record<string, unknown>));
  }

  public async getByUserId(userId: string): Promise<GroupMembership[]> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: GSI1_INDEX_NAME,
        KeyConditionExpression: '#gsi1pk = :gsi1pk',
        ExpressionAttributeNames: {
          '#gsi1pk': 'GSI1PK',
        },
        ExpressionAttributeValues: {
          ':gsi1pk': this.buildUserGsiPk(userId),
        },
      })
    );

    return (result.Items ?? []).map((item) => this.toMembership(item as Record<string, unknown>));
  }

  public async getPendingInvitationsByUserId(userId: string): Promise<GroupMembership[]> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: GSI1_INDEX_NAME,
        KeyConditionExpression: '#gsi1pk = :gsi1pk',
        FilterExpression: '#status = :pending',
        ExpressionAttributeNames: {
          '#gsi1pk': 'GSI1PK',
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':gsi1pk': this.buildUserGsiPk(userId),
          ':pending': 'PENDING',
        },
      })
    );

    return (result.Items ?? []).map((item) => this.toMembership(item as Record<string, unknown>));
  }

  public async create(input: CreateGroupMembershipInput): Promise<GroupMembership> {
    const now = new Date().toISOString();
    const membership: GroupMembership = {
      ...input,
      createdAt: now,
      updatedAt: now,
    };

    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: this.toItem(membership),
      })
    );

    return membership;
  }

  public async update(
    groupId: string,
    userId: string,
    updates: UpdateGroupMembershipInput
  ): Promise<GroupMembership> {
    const expressionAttributeNames: Record<string, string> = {
      '#updatedAt': 'updatedAt',
      '#ttl': 'TTL',
    };
    const expressionAttributeValues: Record<string, unknown> = {
      ':updatedAt': new Date().toISOString(),
    };
    const setExpressions = ['#updatedAt = :updatedAt'];
    const removeExpressions: string[] = [];

    if (updates.role !== undefined) {
      expressionAttributeNames['#role'] = 'role';
      expressionAttributeValues[':role'] = updates.role;
      setExpressions.push('#role = :role');
    }

    if (updates.status !== undefined) {
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[':status'] = updates.status;
      setExpressions.push('#status = :status');
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'invitedBy')) {
      expressionAttributeNames['#invitedBy'] = 'invitedBy';
      if (updates.invitedBy === undefined) {
        removeExpressions.push('#invitedBy');
      } else {
        expressionAttributeValues[':invitedBy'] = updates.invitedBy;
        setExpressions.push('#invitedBy = :invitedBy');
      }
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'invitedAt')) {
      expressionAttributeNames['#invitedAt'] = 'invitedAt';
      if (updates.invitedAt === undefined) {
        removeExpressions.push('#invitedAt');
      } else {
        expressionAttributeValues[':invitedAt'] = updates.invitedAt;
        setExpressions.push('#invitedAt = :invitedAt');
      }
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'respondedAt')) {
      expressionAttributeNames['#respondedAt'] = 'respondedAt';
      if (updates.respondedAt === undefined) {
        removeExpressions.push('#respondedAt');
      } else {
        expressionAttributeValues[':respondedAt'] = updates.respondedAt;
        setExpressions.push('#respondedAt = :respondedAt');
      }
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'ttl')) {
      if (updates.ttl === undefined) {
        removeExpressions.push('#ttl');
      } else {
        expressionAttributeValues[':ttl'] = updates.ttl;
        setExpressions.push('#ttl = :ttl');
      }
    }

    const updateExpression = [
      `SET ${setExpressions.join(', ')}`,
      removeExpressions.length > 0 ? `REMOVE ${removeExpressions.join(', ')}` : '',
    ]
      .filter((value) => value !== '')
      .join(' ');

    const result = await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          PK: this.buildGroupPk(groupId),
          SK: this.buildMemberSk(userId),
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      })
    );

    if (!result.Attributes) {
      throw new Error(ERROR_MESSAGES.MEMBERSHIP_NOT_FOUND);
    }

    return this.toMembership(result.Attributes as Record<string, unknown>);
  }

  public async delete(groupId: string, userId: string): Promise<void> {
    await this.docClient.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: {
          PK: this.buildGroupPk(groupId),
          SK: this.buildMemberSk(userId),
        },
      })
    );
  }

  public async deleteByGroupId(groupId: string): Promise<void> {
    const memberships = await this.getByGroupId(groupId);

    await Promise.all(memberships.map((membership) => this.delete(membership.groupId, membership.userId)));
  }

  private buildGroupPk(groupId: string): string {
    return `GROUP#${groupId}`;
  }

  private buildMemberSk(userId: string): string {
    return `${MEMBER_SK_PREFIX}${userId}`;
  }

  private buildUserGsiPk(userId: string): string {
    return `USER#${userId}`;
  }

  private toItem(membership: GroupMembership): Record<string, unknown> {
    return {
      PK: this.buildGroupPk(membership.groupId),
      SK: this.buildMemberSk(membership.userId),
      GSI1PK: this.buildUserGsiPk(membership.userId),
      GSI1SK: this.buildGroupPk(membership.groupId),
      groupId: membership.groupId,
      userId: membership.userId,
      role: membership.role,
      status: membership.status,
      invitedBy: membership.invitedBy,
      invitedAt: membership.invitedAt,
      respondedAt: membership.respondedAt,
      TTL: membership.ttl,
      createdAt: membership.createdAt,
      updatedAt: membership.updatedAt,
    };
  }

  private toMembership(item: Record<string, unknown>): GroupMembership {
    const groupId = item['groupId'];
    const userId = item['userId'];
    const role = item['role'];
    const status = item['status'];
    const invitedBy = item['invitedBy'];
    const invitedAt = item['invitedAt'];
    const respondedAt = item['respondedAt'];
    const ttl = item['TTL'];
    const createdAt = item['createdAt'];
    const updatedAt = item['updatedAt'];

    if (
      typeof groupId !== 'string' ||
      typeof userId !== 'string' ||
      typeof createdAt !== 'string' ||
      typeof updatedAt !== 'string'
    ) {
      throw new Error(ERROR_MESSAGES.INVALID_MEMBERSHIP_DATA);
    }

    if (
      (invitedBy !== undefined && typeof invitedBy !== 'string') ||
      (invitedAt !== undefined && typeof invitedAt !== 'string') ||
      (respondedAt !== undefined && typeof respondedAt !== 'string') ||
      (ttl !== undefined && typeof ttl !== 'number')
    ) {
      throw new Error(ERROR_MESSAGES.INVALID_MEMBERSHIP_DATA);
    }

    const groupRole = this.toGroupRole(role);
    const membershipStatus = this.toGroupMembershipStatus(status);

    return {
      groupId,
      userId,
      role: groupRole,
      status: membershipStatus,
      invitedBy,
      invitedAt,
      respondedAt,
      ttl,
      createdAt,
      updatedAt,
    };
  }

  private toGroupRole(value: unknown): GroupRole {
    if (value === 'OWNER' || value === 'MEMBER') {
      return value;
    }

    throw new Error(ERROR_MESSAGES.INVALID_MEMBERSHIP_DATA);
  }

  private toGroupMembershipStatus(value: unknown): GroupMembershipStatus {
    if (value === 'PENDING' || value === 'ACCEPTED' || value === 'REJECTED') {
      return value;
    }

    throw new Error(ERROR_MESSAGES.INVALID_MEMBERSHIP_DATA);
  }
}
