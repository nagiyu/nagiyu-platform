import {
  BatchGetCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { CreateGroupInput, Group, UpdateGroupInput } from '../../types/index.js';
import type { GroupRepository } from './group-repository.interface.js';

const GROUP_META_SK = '#META#';

const ERROR_MESSAGES = {
  INVALID_GROUP_DATA: 'グループ情報の形式が不正です',
  GROUP_ALREADY_EXISTS: 'グループは既に存在します',
  GROUP_NOT_FOUND: 'グループが見つかりません',
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

  public async batchGetByIds(groupIds: string[]): Promise<Group[]> {
    if (groupIds.length === 0) {
      return [];
    }

    const result = await this.docClient.send(
      new BatchGetCommand({
        RequestItems: {
          [this.tableName]: {
            Keys: groupIds.map((groupId) => ({
              PK: this.buildGroupPk(groupId),
              SK: GROUP_META_SK,
            })),
          },
        },
      })
    );

    const items = result.Responses?.[this.tableName] ?? [];
    return items.map((item) => this.toGroup(item as Record<string, unknown>));
  }

  public async create(input: CreateGroupInput): Promise<Group> {
    const now = new Date().toISOString();
    const group: Group = {
      ...input,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            PK: this.buildGroupPk(input.groupId),
            SK: GROUP_META_SK,
            ...group,
          },
          ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
        })
      );
    } catch (error: unknown) {
      if (this.isConditionalCheckFailedError(error)) {
        throw new Error(ERROR_MESSAGES.GROUP_ALREADY_EXISTS);
      }
      throw error;
    }

    return group;
  }

  public async update(groupId: string, updates: UpdateGroupInput): Promise<Group> {
    const expressionNames: Record<string, string> = {
      '#updatedAt': 'updatedAt',
    };
    const expressionValues: Record<string, unknown> = {
      ':updatedAt': new Date().toISOString(),
    };
    const setExpressions: string[] = ['#updatedAt = :updatedAt'];

    if (updates.name !== undefined) {
      expressionNames['#name'] = 'name';
      expressionValues[':name'] = updates.name;
      setExpressions.push('#name = :name');
    }

    let result;
    try {
      result = await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: {
            PK: this.buildGroupPk(groupId),
            SK: GROUP_META_SK,
          },
          UpdateExpression: `SET ${setExpressions.join(', ')}`,
          ExpressionAttributeNames: expressionNames,
          ExpressionAttributeValues: expressionValues,
          ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
          ReturnValues: 'ALL_NEW',
        })
      );
    } catch (error: unknown) {
      if (this.isConditionalCheckFailedError(error)) {
        throw new Error(ERROR_MESSAGES.GROUP_NOT_FOUND);
      }
      throw error;
    }

    return this.toGroup((result.Attributes ?? {}) as Record<string, unknown>);
  }

  public async delete(groupId: string): Promise<void> {
    try {
      await this.docClient.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: {
            PK: this.buildGroupPk(groupId),
            SK: GROUP_META_SK,
          },
          ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
        })
      );
    } catch (error: unknown) {
      if (this.isConditionalCheckFailedError(error)) {
        throw new Error(ERROR_MESSAGES.GROUP_NOT_FOUND);
      }
      throw error;
    }
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

  private isConditionalCheckFailedError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      error.name === 'ConditionalCheckFailedException'
    );
  }
}
