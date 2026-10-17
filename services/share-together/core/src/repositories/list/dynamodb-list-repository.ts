import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBEntityStore, queryAllItems, type EntityStore } from '@nagiyu/aws';
import type {
  CreateGroupListInput,
  CreatePersonalListInput,
  GroupList,
  PersonalList,
  UpdateGroupListInput,
  UpdatePersonalListInput,
} from '../../types/index.js';
import type { ListRepository } from './list-repository.interface.js';
import {
  PersonalListMapper,
  PERSONAL_LIST_SK_PREFIX,
  buildPersonalListPk,
  type PersonalListKey,
} from './personal-list-mapper.js';
import {
  GroupListMapper,
  GROUP_LIST_SK_PREFIX,
  buildGroupListPk,
  type GroupListKey,
} from './group-list-mapper.js';
import { withDatabaseError } from '../with-database-error.js';

/**
 * DynamoDB List Repository
 *
 * 単一アイテムの CRUD は EntityStore に任せ、PK + SK 接頭辞の一覧 Query だけを自前で持つ。
 */
export class DynamoDBListRepository implements ListRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly personalMapper = new PersonalListMapper();
  private readonly groupMapper = new GroupListMapper();
  private readonly personalStore: EntityStore<PersonalList, PersonalListKey>;
  private readonly groupStore: EntityStore<GroupList, GroupListKey>;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.personalStore = new DynamoDBEntityStore(docClient, tableName, this.personalMapper);
    this.groupStore = new DynamoDBEntityStore(docClient, tableName, this.groupMapper);
  }

  public async getPersonalListsByUserId(userId: string): Promise<PersonalList[]> {
    const items = await this.queryByPrefix(buildPersonalListPk(userId), PERSONAL_LIST_SK_PREFIX);
    return items.map((item) => this.personalMapper.toEntity(item));
  }

  public async getPersonalListById(userId: string, listId: string): Promise<PersonalList | null> {
    return this.personalStore.get({ userId, listId });
  }

  public async createPersonalList(input: CreatePersonalListInput): Promise<PersonalList> {
    const now = Date.now();
    // updatedAt は store が書き込み時に現在時刻で上書きする。Entity 型上は必須のため値だけ渡す。
    return this.personalStore.create({ ...input, createdAt: now, updatedAt: now });
  }

  public async updatePersonalList(
    userId: string,
    listId: string,
    updates: UpdatePersonalListInput
  ): Promise<PersonalList> {
    return this.personalStore.update({ userId, listId }, updates);
  }

  public async deletePersonalList(userId: string, listId: string): Promise<void> {
    await this.personalStore.deleteIfExists({ userId, listId });
  }

  public async getGroupListsByGroupId(groupId: string): Promise<GroupList[]> {
    const items = await this.queryByPrefix(buildGroupListPk(groupId), GROUP_LIST_SK_PREFIX);
    return items.map((item) => this.groupMapper.toEntity(item));
  }

  public async getGroupListById(groupId: string, listId: string): Promise<GroupList | null> {
    return this.groupStore.get({ groupId, listId });
  }

  public async createGroupList(input: CreateGroupListInput): Promise<GroupList> {
    const now = Date.now();
    return this.groupStore.create({ ...input, createdAt: now, updatedAt: now });
  }

  public async updateGroupList(
    groupId: string,
    listId: string,
    updates: UpdateGroupListInput
  ): Promise<GroupList> {
    return this.groupStore.update({ groupId, listId }, updates);
  }

  public async deleteGroupList(groupId: string, listId: string): Promise<void> {
    await this.groupStore.deleteIfExists({ groupId, listId });
  }

  private async queryByPrefix(pk: string, skPrefix: string): Promise<Record<string, unknown>[]> {
    const items = await withDatabaseError(() =>
      queryAllItems(this.docClient, {
        TableName: this.tableName,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :skPrefix)',
        ExpressionAttributeNames: {
          '#pk': 'PK',
          '#sk': 'SK',
        },
        ExpressionAttributeValues: {
          ':pk': pk,
          ':skPrefix': skPrefix,
        },
      })
    );
    return items as Record<string, unknown>[];
  }
}
