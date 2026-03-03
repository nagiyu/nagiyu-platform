import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type {
  CreateGroupListInput,
  CreatePersonalListInput,
  GroupList,
  PersonalList,
  UpdateGroupListInput,
  UpdatePersonalListInput,
} from '../../types/index.js';
import type { ListRepository } from './list-repository.interface.js';

const PERSONAL_LIST_SK_PREFIX = 'PLIST#';
const GROUP_LIST_SK_PREFIX = 'GLIST#';

const ERROR_MESSAGES = {
  INVALID_PERSONAL_LIST_DATA: '個人リスト情報の形式が不正です',
  INVALID_GROUP_LIST_DATA: 'グループリスト情報の形式が不正です',
  PERSONAL_LIST_ALREADY_EXISTS: '個人リストは既に存在します',
  GROUP_LIST_ALREADY_EXISTS: 'グループリストは既に存在します',
  PERSONAL_LIST_NOT_FOUND: '個人リストが見つかりません',
  GROUP_LIST_NOT_FOUND: 'グループリストが見つかりません',
  DEFAULT_PERSONAL_LIST_NOT_DELETABLE: 'デフォルトリストは削除できません',
} as const;

export class DynamoDBListRepository implements ListRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
  }

  public async getPersonalListsByUserId(userId: string): Promise<PersonalList[]> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :skPrefix)',
        ExpressionAttributeNames: {
          '#pk': 'PK',
          '#sk': 'SK',
        },
        ExpressionAttributeValues: {
          ':pk': this.buildUserPk(userId),
          ':skPrefix': PERSONAL_LIST_SK_PREFIX,
        },
      })
    );

    if (!result.Items) {
      return [];
    }

    return result.Items.map((item) => this.toPersonalList(item as Record<string, unknown>));
  }

  public async getPersonalListById(userId: string, listId: string): Promise<PersonalList | null> {
    const result = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: this.buildUserPk(userId),
          SK: this.buildPersonalListSk(listId),
        },
      })
    );

    if (!result.Item) {
      return null;
    }

    return this.toPersonalList(result.Item as Record<string, unknown>);
  }

  public async createPersonalList(input: CreatePersonalListInput): Promise<PersonalList> {
    const now = new Date().toISOString();
    const item = {
      PK: this.buildUserPk(input.userId),
      SK: this.buildPersonalListSk(input.listId),
      listId: input.listId,
      userId: input.userId,
      name: input.name,
      isDefault: input.isDefault,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
          ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
        })
      );
    } catch (error) {
      if (this.isConditionalCheckFailed(error)) {
        throw new Error(ERROR_MESSAGES.PERSONAL_LIST_ALREADY_EXISTS);
      }
      throw error;
    }

    return this.toPersonalList(item);
  }

  public async updatePersonalList(
    userId: string,
    listId: string,
    updates: UpdatePersonalListInput
  ): Promise<PersonalList> {
    const now = new Date().toISOString();
    const names: Record<string, string> = { '#updatedAt': 'updatedAt' };
    const values: Record<string, string> = { ':updatedAt': now };
    const setExpressions: string[] = ['#updatedAt = :updatedAt'];

    if (updates.name !== undefined) {
      names['#name'] = 'name';
      values[':name'] = updates.name;
      setExpressions.push('#name = :name');
    }

    const result = await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          PK: this.buildUserPk(userId),
          SK: this.buildPersonalListSk(listId),
        },
        UpdateExpression: `SET ${setExpressions.join(', ')}`,
        ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      })
    );

    if (!result.Attributes) {
      throw new Error(ERROR_MESSAGES.PERSONAL_LIST_NOT_FOUND);
    }

    return this.toPersonalList(result.Attributes as Record<string, unknown>);
  }

  public async deletePersonalList(userId: string, listId: string): Promise<void> {
    const item = await this.getPersonalListById(userId, listId);

    if (!item) {
      return;
    }

    if (item.isDefault) {
      throw new Error(ERROR_MESSAGES.DEFAULT_PERSONAL_LIST_NOT_DELETABLE);
    }

    await this.docClient.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: {
          PK: this.buildUserPk(userId),
          SK: this.buildPersonalListSk(listId),
        },
      })
    );
  }

  public async getGroupListsByGroupId(groupId: string): Promise<GroupList[]> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :skPrefix)',
        ExpressionAttributeNames: {
          '#pk': 'PK',
          '#sk': 'SK',
        },
        ExpressionAttributeValues: {
          ':pk': this.buildGroupPk(groupId),
          ':skPrefix': GROUP_LIST_SK_PREFIX,
        },
      })
    );

    if (!result.Items) {
      return [];
    }

    return result.Items.map((item) => this.toGroupList(item as Record<string, unknown>));
  }

  public async getGroupListById(groupId: string, listId: string): Promise<GroupList | null> {
    const result = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: this.buildGroupPk(groupId),
          SK: this.buildGroupListSk(listId),
        },
      })
    );

    if (!result.Item) {
      return null;
    }

    return this.toGroupList(result.Item as Record<string, unknown>);
  }

  public async createGroupList(input: CreateGroupListInput): Promise<GroupList> {
    const now = new Date().toISOString();
    const item = {
      PK: this.buildGroupPk(input.groupId),
      SK: this.buildGroupListSk(input.listId),
      listId: input.listId,
      groupId: input.groupId,
      name: input.name,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
          ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
        })
      );
    } catch (error) {
      if (this.isConditionalCheckFailed(error)) {
        throw new Error(ERROR_MESSAGES.GROUP_LIST_ALREADY_EXISTS);
      }
      throw error;
    }

    return this.toGroupList(item);
  }

  public async updateGroupList(
    groupId: string,
    listId: string,
    updates: UpdateGroupListInput
  ): Promise<GroupList> {
    const now = new Date().toISOString();
    const names: Record<string, string> = { '#updatedAt': 'updatedAt' };
    const values: Record<string, string> = { ':updatedAt': now };
    const setExpressions: string[] = ['#updatedAt = :updatedAt'];

    if (updates.name !== undefined) {
      names['#name'] = 'name';
      values[':name'] = updates.name;
      setExpressions.push('#name = :name');
    }

    const result = await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          PK: this.buildGroupPk(groupId),
          SK: this.buildGroupListSk(listId),
        },
        UpdateExpression: `SET ${setExpressions.join(', ')}`,
        ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      })
    );

    if (!result.Attributes) {
      throw new Error(ERROR_MESSAGES.GROUP_LIST_NOT_FOUND);
    }

    return this.toGroupList(result.Attributes as Record<string, unknown>);
  }

  public async deleteGroupList(groupId: string, listId: string): Promise<void> {
    await this.docClient.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: {
          PK: this.buildGroupPk(groupId),
          SK: this.buildGroupListSk(listId),
        },
      })
    );
  }

  private buildUserPk(userId: string): string {
    return `USER#${userId}`;
  }

  private buildPersonalListSk(listId: string): string {
    return `${PERSONAL_LIST_SK_PREFIX}${listId}`;
  }

  private buildGroupPk(groupId: string): string {
    return `GROUP#${groupId}`;
  }

  private buildGroupListSk(listId: string): string {
    return `${GROUP_LIST_SK_PREFIX}${listId}`;
  }

  private isConditionalCheckFailed(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      error.name === 'ConditionalCheckFailedException'
    );
  }

  private toPersonalList(item: Record<string, unknown>): PersonalList {
    const listId = item['listId'];
    const userId = item['userId'];
    const name = item['name'];
    const isDefault = item['isDefault'];
    const createdAt = item['createdAt'];
    const updatedAt = item['updatedAt'];

    if (
      typeof listId !== 'string' ||
      typeof userId !== 'string' ||
      typeof name !== 'string' ||
      typeof isDefault !== 'boolean' ||
      typeof createdAt !== 'string' ||
      typeof updatedAt !== 'string'
    ) {
      throw new Error(ERROR_MESSAGES.INVALID_PERSONAL_LIST_DATA);
    }

    return {
      listId,
      userId,
      name,
      isDefault,
      createdAt,
      updatedAt,
    };
  }

  private toGroupList(item: Record<string, unknown>): GroupList {
    const listId = item['listId'];
    const groupId = item['groupId'];
    const name = item['name'];
    const createdBy = item['createdBy'];
    const createdAt = item['createdAt'];
    const updatedAt = item['updatedAt'];

    if (
      typeof listId !== 'string' ||
      typeof groupId !== 'string' ||
      typeof name !== 'string' ||
      typeof createdBy !== 'string' ||
      typeof createdAt !== 'string' ||
      typeof updatedAt !== 'string'
    ) {
      throw new Error(ERROR_MESSAGES.INVALID_GROUP_LIST_DATA);
    }

    return {
      listId,
      groupId,
      name,
      createdBy,
      createdAt,
      updatedAt,
    };
  }
}
