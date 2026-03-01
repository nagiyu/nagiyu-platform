import { GetCommand, QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
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

const ERROR_MESSAGES = {
  INVALID_PERSONAL_LIST_DATA: '個人リスト情報の形式が不正です',
  NOT_IMPLEMENTED: 'この操作は未実装です',
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

  public async createPersonalList(_input: CreatePersonalListInput): Promise<PersonalList> {
    throw new Error(ERROR_MESSAGES.NOT_IMPLEMENTED);
  }

  public async updatePersonalList(
    _userId: string,
    _listId: string,
    _updates: UpdatePersonalListInput
  ): Promise<PersonalList> {
    throw new Error(ERROR_MESSAGES.NOT_IMPLEMENTED);
  }

  public async deletePersonalList(_userId: string, _listId: string): Promise<void> {
    throw new Error(ERROR_MESSAGES.NOT_IMPLEMENTED);
  }

  public async getGroupListsByGroupId(_groupId: string): Promise<GroupList[]> {
    throw new Error(ERROR_MESSAGES.NOT_IMPLEMENTED);
  }

  public async getGroupListById(_groupId: string, _listId: string): Promise<GroupList | null> {
    throw new Error(ERROR_MESSAGES.NOT_IMPLEMENTED);
  }

  public async createGroupList(_input: CreateGroupListInput): Promise<GroupList> {
    throw new Error(ERROR_MESSAGES.NOT_IMPLEMENTED);
  }

  public async updateGroupList(
    _groupId: string,
    _listId: string,
    _updates: UpdateGroupListInput
  ): Promise<GroupList> {
    throw new Error(ERROR_MESSAGES.NOT_IMPLEMENTED);
  }

  public async deleteGroupList(_groupId: string, _listId: string): Promise<void> {
    throw new Error(ERROR_MESSAGES.NOT_IMPLEMENTED);
  }

  private buildUserPk(userId: string): string {
    return `USER#${userId}`;
  }

  private buildPersonalListSk(listId: string): string {
    return `${PERSONAL_LIST_SK_PREFIX}${listId}`;
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
}
