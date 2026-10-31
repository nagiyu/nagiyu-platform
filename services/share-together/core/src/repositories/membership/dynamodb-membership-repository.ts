import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { batchWriteAll, DynamoDBEntityStore, queryAllItems, type EntityStore } from '@nagiyu/aws';
import type {
  CreateGroupMembershipInput,
  GroupMembership,
  UpdateGroupMembershipInput,
} from '../../types/index.js';
import type { MembershipRepository } from './membership-repository.interface.js';
import {
  GroupMembershipMapper,
  MEMBER_SK_PREFIX,
  MEMBERSHIP_GSI1_INDEX_NAME,
  buildMembershipGsi1Pk,
  buildMembershipPk,
  type MembershipKey,
} from './membership-mapper.js';
import { withDatabaseError } from '../with-database-error.js';

/**
 * DynamoDB Membership Repository
 *
 * 単一アイテムの CRUD は EntityStore に任せ、グループ単位とユーザー単位 (GSI1) の
 * 一覧 Query とグループ単位の一括削除だけを自前で持つ。
 */
export class DynamoDBMembershipRepository implements MembershipRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly mapper = new GroupMembershipMapper();
  private readonly store: EntityStore<GroupMembership, MembershipKey>;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.store = new DynamoDBEntityStore(docClient, tableName, this.mapper);
  }

  public async getById(groupId: string, userId: string): Promise<GroupMembership | null> {
    return this.store.get({ groupId, userId });
  }

  public async getByGroupId(groupId: string): Promise<GroupMembership[]> {
    const items = await this.queryByGroupId(groupId);
    return items.map((item) => this.mapper.toEntity(item));
  }

  public async getByUserId(userId: string): Promise<GroupMembership[]> {
    const items = await withDatabaseError(() =>
      queryAllItems(this.docClient, {
        TableName: this.tableName,
        IndexName: MEMBERSHIP_GSI1_INDEX_NAME,
        KeyConditionExpression: '#gsi1pk = :gsi1pk',
        ExpressionAttributeNames: {
          '#gsi1pk': 'GSI1PK',
        },
        ExpressionAttributeValues: {
          ':gsi1pk': buildMembershipGsi1Pk(userId),
        },
      })
    );

    return items.map((item) => this.mapper.toEntity(item as Record<string, unknown>));
  }

  public async getPendingInvitationsByUserId(userId: string): Promise<GroupMembership[]> {
    const items = await withDatabaseError(() =>
      queryAllItems(this.docClient, {
        TableName: this.tableName,
        IndexName: MEMBERSHIP_GSI1_INDEX_NAME,
        KeyConditionExpression: '#gsi1pk = :gsi1pk',
        // 書き込まれないまま残る旧形式のアイテムは小文字の status を持つため、両方を見る
        FilterExpression: '#status = :pending OR #legacyStatus = :pending',
        ExpressionAttributeNames: {
          '#gsi1pk': 'GSI1PK',
          '#status': 'Status',
          '#legacyStatus': 'status',
        },
        ExpressionAttributeValues: {
          ':gsi1pk': buildMembershipGsi1Pk(userId),
          ':pending': 'PENDING',
        },
      })
    );

    return items
      .map((item) => this.mapper.toEntity(item as Record<string, unknown>))
      .filter((membership) => membership.status === 'PENDING');
  }

  public async create(input: CreateGroupMembershipInput): Promise<GroupMembership> {
    return this.store.create(input);
  }

  public async update(
    groupId: string,
    userId: string,
    updates: UpdateGroupMembershipInput
  ): Promise<GroupMembership> {
    return this.store.update({ groupId, userId }, updates);
  }

  public async delete(groupId: string, userId: string): Promise<void> {
    await this.store.delete({ groupId, userId });
  }

  public async deleteByGroupId(groupId: string): Promise<void> {
    const items = await this.queryByGroupId(groupId, { keysOnly: true });
    if (items.length === 0) {
      return;
    }

    // 並行した削除で一部が先になくなっても途中で止まらないよう、条件なしの一括削除にする
    await withDatabaseError(() =>
      batchWriteAll(
        this.docClient,
        this.tableName,
        items.map((item) => ({ DeleteRequest: { Key: { PK: item['PK'], SK: item['SK'] } } }))
      )
    );
  }

  private async queryByGroupId(
    groupId: string,
    options: { keysOnly?: boolean } = {}
  ): Promise<Record<string, unknown>[]> {
    const items = await withDatabaseError(() =>
      queryAllItems(this.docClient, {
        TableName: this.tableName,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :skPrefix)',
        ExpressionAttributeNames: {
          '#pk': 'PK',
          '#sk': 'SK',
        },
        ExpressionAttributeValues: {
          ':pk': buildMembershipPk(groupId),
          ':skPrefix': MEMBER_SK_PREFIX,
        },
        // 削除にはキーだけが要るため、本文を転送しない
        ...(options.keysOnly ? { ProjectionExpression: '#pk, #sk' } : {}),
      })
    );
    return items as Record<string, unknown>[];
  }
}
