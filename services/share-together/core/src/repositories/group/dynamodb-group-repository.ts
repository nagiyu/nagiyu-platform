import { GetCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { CreateGroupInput, Group, UpdateGroupInput } from '../../types/index.js';
import type { GroupRepository } from './group-repository.interface.js';

const GROUP_META_SK = '#META#';

const ERROR_MESSAGES = {
  INVALID_GROUP_DATA: 'グループ情報の形式が不正です',
  NOT_IMPLEMENTED: 'この操作は未実装です',
} as const;

export class DynamoDBGroupRepository implements GroupRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
  }

  public async getById(groupId: string): Promise<Group | null> {
    const result = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: this.buildGroupPk(groupId),
          SK: GROUP_META_SK,
        },
      })
    );

    if (!result.Item) {
      return null;
    }

    return this.toGroup(result.Item as Record<string, unknown>);
  }

  public async batchGetByIds(_groupIds: string[]): Promise<Group[]> {
    throw new Error(ERROR_MESSAGES.NOT_IMPLEMENTED);
  }

  public async create(_input: CreateGroupInput): Promise<Group> {
    throw new Error(ERROR_MESSAGES.NOT_IMPLEMENTED);
  }

  public async update(_groupId: string, _updates: UpdateGroupInput): Promise<Group> {
    throw new Error(ERROR_MESSAGES.NOT_IMPLEMENTED);
  }

  public async delete(_groupId: string): Promise<void> {
    throw new Error(ERROR_MESSAGES.NOT_IMPLEMENTED);
  }

  private buildGroupPk(groupId: string): string {
    return `GROUP#${groupId}`;
  }

  private toGroup(item: Record<string, unknown>): Group {
    const groupId = item['groupId'];
    const name = item['name'];
    const ownerUserId = item['ownerUserId'];
    const createdAt = item['createdAt'];
    const updatedAt = item['updatedAt'];

    if (
      typeof groupId !== 'string' ||
      typeof name !== 'string' ||
      typeof ownerUserId !== 'string' ||
      typeof createdAt !== 'string' ||
      typeof updatedAt !== 'string'
    ) {
      throw new Error(ERROR_MESSAGES.INVALID_GROUP_DATA);
    }

    return {
      groupId,
      name,
      ownerUserId,
      createdAt,
      updatedAt,
    };
  }
}
